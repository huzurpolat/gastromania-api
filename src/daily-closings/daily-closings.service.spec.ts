import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { ChecklistStatus } from '../checklists/schemas/checklist.schema';
import { DashboardNotificationSeverity } from '../dashboard/schemas/notification.schema';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import { StockMovementType } from '../stock/schemas/stock-movement.schema';
import { TableStatus } from '../tables/schemas/table.schema';
import { DailyClosingsService } from './daily-closings.service';
import { DailyClosingStatus } from './schemas/daily-closing.schema';

const leanValue = <T>(value: T) => ({ lean: jest.fn().mockResolvedValue(value) });
const queryValue = <T>(value: T) => ({
  sort: jest.fn(() => queryValue(value)),
  lean: jest.fn().mockResolvedValue(value),
});
const findModel = <T>(items: T[]) => ({
  find: jest.fn(() => queryValue(items)),
});

describe('DailyClosingsService', () => {
  const actor = {
    sub: 'manager-1',
    email: 'filialleiter@bonn.local',
    roles: [Role.Filialleiter],
    permissions: ['dailyClosings.view', 'dailyClosings.manage'],
    locationIds: ['loc-1'],
    managedLocationIds: ['loc-1'],
  };

  const createService = (options: {
    orders?: unknown[];
    stockMovements?: unknown[];
    stockItems?: unknown[];
    checklists?: unknown[];
    tables?: unknown[];
    existingClosing?: unknown;
  } = {}) => {
    const dailyClosingModel = {
      find: jest.fn(() => queryValue([])),
      findById: jest.fn(),
      findOne: jest.fn(() => Promise.resolve(options.existingClosing ?? null)),
      findOneAndUpdate: jest.fn(() =>
        leanValue({
          _id: 'closing-1',
          locationId: 'loc-1',
          businessDate: new Date('2026-06-02'),
          status: DailyClosingStatus.ReadyForReview,
          salesSummary: {},
          paymentSummary: {},
          orderSummary: {},
          checklistSummary: {},
          inventorySummary: {},
          marginSummary: {},
          issueList: [],
          activityLog: [],
          statusHistory: [],
        }),
      ),
      findByIdAndUpdate: jest.fn(),
    };
    const locationModel = {
      find: jest.fn(() => queryValue([{ _id: 'loc-1', name: 'Bonn' }])),
      findById: jest.fn(() => leanValue({ _id: 'loc-1', name: 'Bonn', companyId: 'company-1', regionId: 'nrw' })),
    };
    const orderModel = findModel(options.orders ?? []);
    const stockMovementModel = findModel(options.stockMovements ?? []);
    const stockItemModel = findModel(options.stockItems ?? []);
    const checklistModel = findModel(options.checklists ?? []);
    const tableModel = findModel(options.tables ?? []);
    const notificationModel = {
      create: jest.fn().mockResolvedValue({ severity: DashboardNotificationSeverity.Info }),
    };
    const accessPolicy = {
      assertCanManageLocation: jest.fn().mockResolvedValue(undefined),
      assertCanAccessLocation: jest.fn().mockResolvedValue(undefined),
      getReadableLocationIds: jest.fn().mockResolvedValue(['loc-1']),
      isPlatformAdmin: jest.fn().mockReturnValue(false),
    };

    return {
      service: new DailyClosingsService(
        dailyClosingModel as never,
        locationModel as never,
        orderModel as never,
        stockMovementModel as never,
        stockItemModel as never,
        checklistModel as never,
        tableModel as never,
        notificationModel as never,
        accessPolicy as never,
      ),
      dailyClosingModel,
      notificationModel,
    };
  };

  it('generates daily closing figures from orders, stock movements and checklists', async () => {
    const { service, dailyClosingModel } = createService({
      orders: [
        {
          locationId: 'loc-1',
          status: OrderStatus.Closed,
          paymentStatus: PaymentStatus.Paid,
          paymentMethod: PaymentMethod.Cash,
          total: 100,
          tax: 19,
          discountTotal: 5,
          tipTotal: 8,
        },
        {
          locationId: 'loc-1',
          status: OrderStatus.Cancelled,
          paymentStatus: PaymentStatus.Cancelled,
          total: 30,
        },
        {
          locationId: 'loc-1',
          status: OrderStatus.Accepted,
          paymentStatus: PaymentStatus.Open,
          total: 20,
        },
      ],
      stockMovements: [
        { type: StockMovementType.OrderConsumption, valueNet: -32 },
        { type: StockMovementType.Spoilage, valueNet: -7 },
      ],
      stockItems: [
        { name: 'Fleisch', quantity: 1, minQuantity: 2 },
        { name: 'Salat', quantity: -1, minQuantity: 1 },
      ],
      checklists: [
        {
          title: 'Schlusscheckliste',
          templateKey: 'closing',
          area: 'closing',
          status: ChecklistStatus.Open,
          tasks: [{ title: 'Kasse', isDone: false }],
        },
      ],
      tables: [{ status: TableStatus.Occupied, isActive: true }],
    });

    await service.generate(
      { locationId: 'loc-1', businessDate: '2026-06-02' },
      actor,
    );
    const update = dailyClosingModel.findOneAndUpdate.mock.calls[0][1].$set;

    expect(update.salesSummary.grossSales).toBe(100);
    expect(update.salesSummary.orderCount).toBe(1);
    expect(update.salesSummary.cancelledOrderCount).toBe(1);
    expect(update.paymentSummary.expectedCash).toBe(100);
    expect(update.orderSummary.openOrders).toBe(1);
    expect(update.marginSummary.foodCost).toBe(32);
    expect(update.marginSummary.grossMargin).toBe(68);
    expect(update.inventorySummary.lowStockItems).toBe(2);
    expect(update.inventorySummary.negativeStockItems).toBe(1);
    expect(update.issueList).toEqual(
      expect.arrayContaining([
        '1 offene Bestellungen',
        'Schliessungscheckliste nicht abgeschlossen',
        '1 negative Lagerbestaende',
      ]),
    );
  });

  it('requires a difference note when cash difference exists', async () => {
    const closing = {
      _id: 'closing-1',
      locationId: 'loc-1',
      status: DailyClosingStatus.ReadyForReview,
      paymentSummary: { expectedCash: 100, countedCash: 0 },
      orderSummary: {
        openOrders: 0,
        unpaidOrders: 0,
        readyButNotServed: 0,
        tablesStillOccupied: 0,
      },
      checklistSummary: {
        closingChecklistCompleted: true,
        openChecklistItems: 0,
        blockedChecklistItems: 0,
      },
      inventorySummary: { negativeStockItems: 0 },
    };
    const { service, dailyClosingModel } = createService();
    dailyClosingModel.findById.mockResolvedValue(closing);

    await expect(
      service.complete(
        'closing-1',
        { countedCash: 90, issueNote: 'Kasse geprüft' },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks closing with issues when open problems exist', async () => {
    const closing = {
      _id: 'closing-1',
      locationId: 'loc-1',
      status: DailyClosingStatus.ReadyForReview,
      paymentSummary: { expectedCash: 0, countedCash: 0 },
      orderSummary: {
        openOrders: 1,
        unpaidOrders: 0,
        readyButNotServed: 0,
        tablesStillOccupied: 0,
      },
      checklistSummary: {
        closingChecklistCompleted: true,
        openChecklistItems: 0,
        blockedChecklistItems: 0,
      },
      inventorySummary: { negativeStockItems: 0 },
    };
    const { service, dailyClosingModel } = createService();
    dailyClosingModel.findById.mockResolvedValue(closing);
    dailyClosingModel.findByIdAndUpdate.mockReturnValue(
      leanValue({
        ...closing,
        status: DailyClosingStatus.CompletedWithIssues,
        issueList: ['1 offene Bestellungen'],
      }),
    );

    const result = await service.complete(
      'closing-1',
      { countedCash: 0, issueNote: 'Eine Bestellung offen' },
      actor,
    );

    expect(result?.status).toBe(DailyClosingStatus.CompletedWithIssues);
    expect(dailyClosingModel.findByIdAndUpdate.mock.calls[0][1].$set.status).toBe(
      DailyClosingStatus.CompletedWithIssues,
    );
  });

  it('blocks service role from managing daily closings', async () => {
    const { service } = createService();

    await expect(
      service.generate(
        { locationId: 'loc-1', businessDate: '2026-06-02' },
        { ...actor, roles: [Role.Service] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
