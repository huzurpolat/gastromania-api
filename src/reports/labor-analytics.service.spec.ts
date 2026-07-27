import { ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import {
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import { TimeEntryStatus } from '../time-tracking/schemas/time-entry.schema';
import { LaborAnalyticsService } from './labor-analytics.service';

const leanQuery = <T>(items: T[]) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(items),
});

const leanModel = <T>(items: T[]) => ({
  find: jest.fn(() => leanQuery(items)),
  findOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })),
});

describe('LaborAnalyticsService', () => {
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
    users?: unknown[];
    locations?: unknown[];
    departments?: unknown[];
    settings?: unknown;
  }) => {
    const orderModel = leanModel(data.orders ?? []);
    const timeEntryModel = leanModel(data.entries ?? []);
    const userModel = leanModel(data.users ?? []);
    const locationModel = leanModel(
      data.locations ?? [{ _id: 'loc-1', name: 'Koeln', tenantId: 'tenant-1' }],
    );
    const departmentModel = leanModel(
      data.departments ?? [{ _id: 'dep-service', name: 'Service' }],
    );
    const settingsModel = {
      findOne: jest.fn(() => ({
        lean: jest.fn().mockResolvedValue(data.settings ?? null),
      })),
    };
    const accessPolicy = {
      isPlatformAdmin: jest.fn().mockReturnValue(false),
      assertCanAccessLocation: jest.fn().mockResolvedValue(undefined),
      getReadableLocationIds: jest.fn().mockResolvedValue(['loc-1']),
    };

    return {
      service: new LaborAnalyticsService(
        orderModel as never,
        timeEntryModel as never,
        userModel as never,
        locationModel as never,
        departmentModel as never,
        settingsModel as never,
        accessPolicy as never,
      ),
      orderModel,
      accessPolicy,
    };
  };

  it('calculates labor cost, labor cost percentage and revenue per worked hour from paid orders and closed time entries', async () => {
    const { service, orderModel } = createService({
      settings: { laborCostWarningThresholdPercent: 15 },
      orders: [
        {
          _id: 'order-paid',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          paymentStatus: PaymentStatus.Paid,
          status: OrderStatus.Served,
          total: 1000,
          refundTotal: 0,
          createdAt: new Date('2026-06-10T12:00:00Z'),
        },
      ],
      users: [
        {
          _id: 'user-1',
          tenantId: 'tenant-1',
          firstName: 'Max',
          lastName: 'Service',
          email: 'max@tenant.local',
          hourlyRate: 20,
          departmentId: 'dep-service',
          locationIds: ['loc-1'],
          isActive: true,
        },
      ],
      entries: [
        {
          _id: 'entry-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          employeeId: 'user-1',
          status: TimeEntryStatus.Closed,
          netDurationMinutes: 600,
          clockIn: new Date('2026-06-10T08:00:00Z'),
        },
      ],
    });

    const result = await service.getLaborAnalytics(actor as never, {
      week: 24,
      year: 2026,
    });

    expect(orderModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentStatus: PaymentStatus.Paid,
        status: { $ne: OrderStatus.Cancelled },
      }),
    );
    expect(result.summary.revenue).toBe(1000);
    expect(result.summary.actualHours).toBe(10);
    expect(result.summary.laborCost).toBe(200);
    expect(result.summary.laborCostPercentage).toBe(20);
    expect(result.summary.revenuePerHour).toBe(100);
    expect(result.summary.warning?.type).toBe('LABOR_COST_WARNING');
    expect(result.locations[0]).toMatchObject({
      id: 'loc-1',
      revenue: 1000,
      laborCost: 200,
      laborCostPercentage: 20,
      revenuePerHour: 100,
    });
    expect(result.departments[0]).toMatchObject({
      id: 'dep-service',
      revenue: 1000,
      laborCost: 200,
    });
    expect(result.employees[0]).toMatchObject({
      employeeId: 'user-1',
      hourlyRate: 20,
      actualHours: 10,
      laborCost: 200,
    });
  });

  it('rejects platform admins for operative labor analytics', async () => {
    const { service, accessPolicy } = createService({});
    accessPolicy.isPlatformAdmin.mockReturnValue(true);

    await expect(
      service.getLaborAnalytics(
        { ...actor, tenantId: undefined, roles: [Role.PlatformAdmin] } as never,
        { week: 24, year: 2026 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
