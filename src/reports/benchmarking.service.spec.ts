import { Role } from '../auth/enums/role.enum';
import {
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import { StaffShiftStatus } from '../staff-planning/schemas/staff-shift.schema';
import { TimeEntryStatus } from '../time-tracking/schemas/time-entry.schema';
import { BenchmarkingService } from './benchmarking.service';

const leanQuery = <T>(items: T[]) => ({
  select: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(items),
});

const leanModel = <T>(items: T[]) => ({
  find: jest.fn(() => leanQuery(items)),
});

describe('BenchmarkingService', () => {
  const actor = {
    sub: 'tenant-admin',
    email: 'admin@tenant.local',
    roles: [Role.TenantAdmin],
    permissions: ['reports.view'],
    tenantId: 'tenant-1',
    locationIds: ['loc-1', 'loc-2'],
  };

  const createService = () => {
    const orderModel = leanModel([
      {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        paymentStatus: PaymentStatus.Paid,
        status: OrderStatus.Served,
        total: 1000,
        refundTotal: 0,
        createdAt: new Date('2026-06-09T12:00:00Z'),
      },
      {
        tenantId: 'tenant-1',
        locationId: 'loc-2',
        paymentStatus: PaymentStatus.Paid,
        status: OrderStatus.Served,
        total: 700,
        refundTotal: 0,
        createdAt: new Date('2026-06-09T12:00:00Z'),
      },
    ]);
    const timeEntryModel = leanModel([
      {
        tenantId: 'tenant-1',
        employeeId: 'user-1',
        locationId: 'loc-1',
        status: TimeEntryStatus.Closed,
        netDurationMinutes: 600,
        clockIn: new Date('2026-06-09T08:00:00Z'),
      },
      {
        tenantId: 'tenant-1',
        employeeId: 'user-2',
        locationId: 'loc-2',
        status: TimeEntryStatus.Closed,
        netDurationMinutes: 420,
        clockIn: new Date('2026-06-09T08:00:00Z'),
      },
    ]);
    const shiftModel = leanModel([
      {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        status: StaffShiftStatus.Published,
        startTime: new Date('2026-06-09T08:00:00Z'),
        endTime: new Date('2026-06-09T18:00:00Z'),
        requiredStaffCount: 1,
        assignedUserIds: ['user-1'],
      },
    ]);
    const userModel = leanModel([
      { _id: 'user-1', tenantId: 'tenant-1', hourlyRate: 20, weeklyHours: 40 },
      { _id: 'user-2', tenantId: 'tenant-1', hourlyRate: 18, weeklyHours: 30 },
    ]);
    const locationModel = leanModel([
      {
        _id: 'loc-1',
        tenantId: 'tenant-1',
        name: 'Koeln',
        areaId: 'area-1',
        regionId: 'region-1',
        isActive: true,
      },
      {
        _id: 'loc-2',
        tenantId: 'tenant-1',
        name: 'Bonn',
        areaId: 'area-1',
        regionId: 'region-1',
        isActive: true,
      },
    ]);
    const areaModel = leanModel([{ _id: 'area-1', name: 'NRW' }]);
    const regionModel = leanModel([
      { _id: 'region-1', name: 'Rheinland', areaId: 'area-1' },
    ]);
    const snapshotModel = leanModel([
      {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        date: new Date('2026-06-09T00:00:00Z'),
        accuracy: 91,
      },
    ]);
    const accessPolicy = {
      isPlatformAdmin: jest.fn().mockReturnValue(false),
      assertCanAccessLocation: jest.fn().mockResolvedValue(undefined),
      getReadableLocationIds: jest.fn().mockResolvedValue(['loc-1', 'loc-2']),
    };
    return {
      service: new BenchmarkingService(
        orderModel as never,
        timeEntryModel as never,
        shiftModel as never,
        userModel as never,
        locationModel as never,
        areaModel as never,
        regionModel as never,
        snapshotModel as never,
        accessPolicy as never,
      ),
      locationModel,
    };
  };

  it('aggregates multi-location benchmark rows and hierarchy groups', async () => {
    const { service, locationModel } = createService();

    const result = await service.getBenchmarking(actor as never, {
      period: 'week',
      week: 24,
      year: 2026,
    });

    expect(locationModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        _id: { $in: ['loc-1', 'loc-2'] },
      }),
    );
    expect(result.locations).toHaveLength(2);
    expect(result.locations[0]).toEqual(
      expect.objectContaining({
        areaName: 'NRW',
        regionName: 'Rheinland',
      }),
    );
    expect(result.areas[0]).toMatchObject({
      id: 'area-1',
      name: 'NRW',
      revenue: 1700,
    });
    expect(result.rankings.topRevenue[0].revenue).toBeGreaterThanOrEqual(
      result.rankings.topRevenue[1].revenue,
    );
    expect(result.summary.locationCount).toBe(2);
  });
});
