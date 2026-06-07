import { ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { ChecklistStatus } from '../checklists/schemas/checklist.schema';
import { DailyClosingStatus } from '../daily-closings/schemas/daily-closing.schema';
import {
  OrderSource,
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import { ReservationStatus } from '../reservations/schemas/reservation.schema';
import { StockMovementType } from '../stock/schemas/stock-movement.schema';
import { TableStatus } from '../tables/schemas/table.schema';
import { DashboardAnalyticsService } from './dashboard-analytics.service';

function queryResult<T>(value: T) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
  };
}

function createModelMock() {
  return {
    aggregate: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockReturnValue(queryResult([])),
  };
}

describe('DashboardAnalyticsService', () => {
  const user = {
    sub: 'user-1',
    email: 'admin@gastromania-demo.de',
    roles: [Role.Admin],
    permissions: ['dashboard.view'],
    tenantId: 'tenant-1',
    locationIds: ['loc-1'],
  };

  function createService() {
    const locationModel = createModelMock();
    const orderModel = createModelMock();
    const reservationModel = createModelMock();
    const tableModel = createModelMock();
    const timeEntryModel = createModelMock();
    const checklistModel = createModelMock();
    const dutyShiftModel = createModelMock();
    const userModel = createModelMock();
    const stockItemModel = createModelMock();
    const stockMovementModel = createModelMock();
    const dailyClosingModel = createModelMock();
    const employeeDocumentModel = createModelMock();
    const employeeFeedbackModel = createModelMock();
    const jobApplicantModel = createModelMock();
    const service = new DashboardAnalyticsService(
      locationModel as never,
      orderModel as never,
      reservationModel as never,
      tableModel as never,
      timeEntryModel as never,
      checklistModel as never,
      dutyShiftModel as never,
      userModel as never,
      stockItemModel as never,
      stockMovementModel as never,
      dailyClosingModel as never,
      employeeDocumentModel as never,
      employeeFeedbackModel as never,
      jobApplicantModel as never,
    );

    jest.spyOn(service, 'alerts').mockResolvedValue([]);

    return {
      service,
      locationModel,
      orderModel,
      reservationModel,
      tableModel,
      timeEntryModel,
      checklistModel,
      dutyShiftModel,
      userModel,
      stockItemModel,
      stockMovementModel,
      dailyClosingModel,
      employeeDocumentModel,
      employeeFeedbackModel,
      jobApplicantModel,
    };
  }

  it('aggregates overview KPIs with the authenticated location scope', async () => {
    const {
      service,
      locationModel,
      orderModel,
      reservationModel,
      tableModel,
      timeEntryModel,
      checklistModel,
      stockItemModel,
      stockMovementModel,
      dailyClosingModel,
    } = createService();
    locationModel.find.mockReturnValue(
      queryResult([{ _id: 'loc-1', name: 'Demo', city: 'Köln' }]),
    );
    orderModel.aggregate
      .mockResolvedValueOnce([{ total: 120 }])
      .mockResolvedValueOnce([{ total: 60 }]);
    orderModel.countDocuments
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3);
    reservationModel.countDocuments
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(7);
    tableModel.countDocuments
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(5);
    timeEntryModel.countDocuments.mockResolvedValueOnce(3);
    checklistModel.aggregate.mockResolvedValueOnce([{ count: 6 }]);
    stockItemModel.aggregate.mockResolvedValueOnce([
      { items: 5, value: 250, lowStockItems: 1, unavailableItems: 0 },
    ]);
    stockMovementModel.aggregate.mockResolvedValueOnce([{ total: 12 }]);
    dailyClosingModel.find.mockReturnValue(
      queryResult([
        { status: DailyClosingStatus.Draft },
        { status: DailyClosingStatus.Completed },
        { status: DailyClosingStatus.CompletedWithIssues },
      ]),
    );

    const overview = await service.getOverview(user, { range: 'today' });

    expect(overview.kpis).toMatchObject({
      revenueToday: 120,
      ordersToday: 3,
      openOrders: 2,
      kitchenOrders: 2,
      readyForPickupOrders: 1,
      counterOrdersToday: 2,
      openCounterOrders: 1,
      openPayments: 3,
      reservationsToday: 4,
      reservationsThisWeek: 7,
      tableUtilization: 25,
      employeesInService: 3,
      openChecklistTasks: 6,
      inventoryValue: 250,
      lowStockItems: 1,
      shrinkageToday: 12,
      dailyClosingOpen: 1,
      dailyClosingCompleted: 2,
      dailyClosingIssues: 1,
    });
    expect(orderModel.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: { $in: ['loc-1'] },
        tenantId: 'tenant-1',
        status: { $ne: OrderStatus.Cancelled },
      }),
    );
    expect(orderModel.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: { $in: ['loc-1'] },
        tenantId: 'tenant-1',
        source: OrderSource.Counter,
        status: { $ne: OrderStatus.Cancelled },
      }),
    );
    expect(orderModel.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: { $in: ['loc-1'] },
        tenantId: 'tenant-1',
        paymentStatus: { $ne: PaymentStatus.Paid },
        status: { $nin: [OrderStatus.Cancelled, OrderStatus.Closed] },
      }),
    );
    expect(reservationModel.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: { $in: ['loc-1'] },
        tenantId: 'tenant-1',
        status: { $ne: ReservationStatus.Cancelled },
      }),
    );
    expect(tableModel.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: { $in: ['loc-1'] },
        tenantId: 'tenant-1',
        isActive: true,
        status: TableStatus.Occupied,
      }),
    );
    expect(checklistModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          $match: expect.objectContaining({
            locationId: { $in: ['loc-1'] },
            tenantId: 'tenant-1',
            status: { $ne: ChecklistStatus.Done },
          }),
        }),
      ]),
    );
    expect(stockMovementModel.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          $match: expect.objectContaining({
            locationId: { $in: ['loc-1'] },
            tenantId: 'tenant-1',
            type: {
              $in: [
                StockMovementType.Shrinkage,
                StockMovementType.Breakage,
                StockMovementType.Spoilage,
                StockMovementType.Loss,
              ],
            },
          }),
        }),
      ]),
    );
  });

  it('rejects a requested location outside of the authenticated scope', () => {
    const { service } = createService();

    expect(() =>
      service.resolveQuery(user, { range: 'today', locationId: 'loc-2' }),
    ).toThrow(ForbiddenException);
  });

  it('adds HR document, recruiting and feedback KPIs to employee dashboard data', async () => {
    const {
      service,
      userModel,
      timeEntryModel,
      dutyShiftModel,
      employeeDocumentModel,
      employeeFeedbackModel,
      jobApplicantModel,
    } = createService();
    userModel.countDocuments.mockResolvedValueOnce(12);
    timeEntryModel.countDocuments.mockResolvedValueOnce(5);
    dutyShiftModel.find.mockReturnValue(queryResult([{ _id: 'shift-1' }]));
    timeEntryModel.find.mockReturnValue(queryResult([{ _id: 'time-1' }]));
    employeeDocumentModel.countDocuments
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(2);
    jobApplicantModel.countDocuments.mockResolvedValueOnce(3);
    employeeFeedbackModel.countDocuments.mockResolvedValueOnce(4);

    const employees = await service.getEmployees(user, { range: 'today' });

    expect(employees).toEqual({
      activeUsers: 12,
      inService: 5,
      plannedShifts: [{ _id: 'shift-1' }],
      openTimeEntries: [{ _id: 'time-1' }],
      hr: {
        documentsTotal: 9,
        expiringDocuments: 2,
        openApplicants: 3,
        openGoals: 4,
      },
    });
    expect(employeeDocumentModel.countDocuments).toHaveBeenCalledWith({
      locationId: { $in: ['loc-1'] },
      tenantId: 'tenant-1',
    });
    expect(jobApplicantModel.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: { $in: ['loc-1'] },
        tenantId: 'tenant-1',
      }),
    );
  });

  it('resolves today to a full local day range', () => {
    const { service } = createService();
    const resolved = service.resolveQuery(user, { range: 'today' });

    expect(resolved.from.getHours()).toBe(0);
    expect(resolved.from.getMinutes()).toBe(0);
    expect(resolved.to.getHours()).toBe(23);
    expect(resolved.to.getMinutes()).toBe(59);
    expect(resolved.locationIds).toEqual(['loc-1']);
    expect(resolved.tenantId).toBe('tenant-1');
  });

  it('blocks platform admins from operative dashboard analytics', () => {
    const { service } = createService();

    expect(() =>
      service.resolveQuery(
        {
          sub: 'platform-1',
          email: 'platform@test.local',
          roles: [Role.PlatformAdminCode],
        },
        { range: 'today' },
      ),
    ).toThrow(ForbiddenException);
  });
});
