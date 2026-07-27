import { Role } from '../auth/enums/role.enum';
import {
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import { StaffShiftStatus } from '../staff-planning/schemas/staff-shift.schema';
import { TimeEntryStatus } from '../time-tracking/schemas/time-entry.schema';
import { ForecastService } from './forecast.service';

const leanQuery = <T>(items: T[]) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(items),
});

const leanModel = <T>(items: T[]) => ({
  find: jest.fn(() => leanQuery(items)),
  findOne: jest.fn(() => leanQuery(items.slice(0, 1))),
  findOneAndUpdate: jest.fn(() => leanQuery(items.slice(0, 1))),
  create: jest.fn(async (payload) => ({ _id: 'created-id', ...payload })),
  updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
});

describe('ForecastService', () => {
  const actor = {
    sub: 'manager-1',
    email: 'manager@tenant.local',
    roles: [Role.TenantAdmin],
    permissions: ['reports.view'],
    tenantId: 'tenant-1',
    locationIds: ['loc-1'],
  };

  const createService = (data: {
    orders?: unknown[];
    entries?: unknown[];
    shifts?: unknown[];
    users?: unknown[];
    locations?: unknown[];
    departments?: unknown[];
    events?: unknown[];
    snapshots?: unknown[];
  }) => {
    const orderModel = leanModel(data.orders ?? []);
    const timeEntryModel = leanModel(data.entries ?? []);
    const shiftModel = leanModel(data.shifts ?? []);
    const userModel = leanModel(data.users ?? []);
    const locationModel = leanModel(
      data.locations ?? [{ _id: 'loc-1', name: 'Koeln', tenantId: 'tenant-1' }],
    );
    const departmentModel = leanModel(
      data.departments ?? [{ _id: 'dep-service', name: 'Service' }],
    );
    const forecastEventModel = leanModel(data.events ?? []);
    const forecastSnapshotModel = leanModel(data.snapshots ?? []);
    const accessPolicy = {
      isPlatformAdmin: jest.fn().mockReturnValue(false),
      assertCanAccessLocation: jest.fn().mockResolvedValue(undefined),
      getReadableLocationIds: jest.fn().mockResolvedValue(['loc-1']),
    };
    return {
      service: new ForecastService(
        orderModel as never,
        timeEntryModel as never,
        shiftModel as never,
        userModel as never,
        locationModel as never,
        departmentModel as never,
        forecastEventModel as never,
        forecastSnapshotModel as never,
        accessPolicy as never,
      ),
      orderModel,
      forecastEventModel,
      forecastSnapshotModel,
    };
  };

  it('forecasts revenue and staffing demand from historical paid orders, time entries and shift shares', async () => {
    const periodStart = new Date('2026-06-08T00:00:00Z');
    const orders = Array.from({ length: 28 }, (_, index) => {
      const createdAt = new Date(periodStart);
      createdAt.setUTCDate(periodStart.getUTCDate() - 28 + index);
      return {
        _id: `order-${index}`,
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        paymentStatus: PaymentStatus.Paid,
        status: OrderStatus.Served,
        total: 100,
        refundTotal: 0,
        createdAt,
      };
    });
    const shifts = [
      {
        _id: 'history-shift',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        departmentId: 'dep-service',
        status: StaffShiftStatus.Published,
        startTime: new Date('2026-05-20T08:00:00Z'),
        endTime: new Date('2026-05-20T16:00:00Z'),
        requiredStaffCount: 1,
        assignedUserIds: ['user-1'],
      },
    ];
    const { service, orderModel } = createService({
      orders,
      shifts,
      users: [{ _id: 'user-1', tenantId: 'tenant-1', hourlyRate: 20 }],
      entries: [
        {
          _id: 'entry-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          employeeId: 'user-1',
          status: TimeEntryStatus.Closed,
          netDurationMinutes: 840,
          clockIn: new Date('2026-05-20T08:00:00Z'),
        },
      ],
    });

    const result = await service.getForecast(actor as never, {
      week: 24,
      year: 2026,
    });

    expect(orderModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: PaymentStatus.Paid,
        status: { $ne: OrderStatus.Cancelled },
      }),
    );
    expect(result.forecastRevenue).toBe(700);
    expect(result.forecastHours).toBe(3.5);
    expect(result.expectedLaborCost).toBe(70);
    expect(result.locations[0]).toMatchObject({
      id: 'loc-1',
      forecastRevenue: 700,
      forecastHours: 3.5,
      plannedHours: 0,
    });
    expect(result.departments[0]).toMatchObject({
      id: 'dep-service',
      forecastHours: 3.5,
      plannedHours: 0,
      missingHours: 3.5,
    });
    expect(result.staffingWarnings[0]).toMatchObject({
      type: 'UNDERSTAFFED',
      locationId: 'loc-1',
      varianceHours: -3.5,
    });
  });

  it('applies active forecast event factors and exposes forecast quality metrics', async () => {
    const periodStart = new Date('2026-06-08T00:00:00Z');
    const orders = Array.from({ length: 28 }, (_, index) => {
      const createdAt = new Date(periodStart);
      createdAt.setUTCDate(periodStart.getUTCDate() - 28 + index);
      return {
        _id: `order-${index}`,
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        paymentStatus: PaymentStatus.Paid,
        status: OrderStatus.Served,
        total: 100,
        refundTotal: 0,
        createdAt,
      };
    });
    const { service, forecastSnapshotModel } = createService({
      orders,
      events: [
        {
          _id: 'event-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          title: 'Stadtfest',
          date: new Date('2026-06-12T00:00:00Z'),
          impactPercent: 20,
          active: true,
        },
      ],
    });

    const result = await service.getForecast(actor as never, {
      week: 24,
      year: 2026,
    });

    expect(result.forecastRevenue).toBe(840);
    expect(result.eventFactor).toBe(1.2);
    expect(result.accuracy).not.toBeNull();
    expect(forecastSnapshotModel.updateOne).toHaveBeenCalled();
  });
});
