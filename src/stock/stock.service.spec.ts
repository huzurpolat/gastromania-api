import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StockMovementType } from './schemas/stock-movement.schema';
import { StockService } from './stock.service';

describe('StockService inventory adjustments', () => {
  const actor = {
    sub: 'user-1',
    email: 'lager@gastromania.local',
    roles: ['Lager'],
    tenantId: 'tenant-1',
  } as never;

  let stockItemModel: { findById: jest.Mock };
  let batchModel: { find: jest.Mock };
  let movementModel: { create: jest.Mock };
  let stockAlertModel: { findOneAndUpdate: jest.Mock; updateMany: jest.Mock };
  let auditLogModel: { create: jest.Mock };
  let accessPolicy: { assertCanAccessLocation: jest.Mock };
  let service: StockService;

  beforeEach(() => {
    stockItemModel = { findById: jest.fn() };
    batchModel = { find: jest.fn() };
    movementModel = { create: jest.fn() };
    stockAlertModel = {
      findOneAndUpdate: jest.fn(),
      updateMany: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    };
    auditLogModel = { create: jest.fn().mockResolvedValue({}) };
    accessPolicy = { assertCanAccessLocation: jest.fn().mockResolvedValue(undefined) };

    service = new StockService(
      stockItemModel as never,
      batchModel as never,
      {} as never,
      {} as never,
      movementModel as never,
      {} as never,
      {} as never,
      stockAlertModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      auditLogModel as never,
      accessPolicy as never,
    );
  });

  it('sets actual inventory quantity, writes a StockMovement and audit log', async () => {
    const item = stockItem({ quantity: 100, averageCost: 2.5 });
    mockFindItem(item);
    mockBatches([]);
    movementModel.create.mockResolvedValue(
      movement({ quantityBefore: 100, quantityAfter: 92, quantityChange: -8 }),
    );

    const result = await service.adjust(
      'stock-1',
      {
        type: StockMovementType.Inventory,
        actualQuantity: 92,
        reason: 'Inventur',
        note: 'Monatsinventur',
      },
      actor,
    );

    expect(accessPolicy.assertCanAccessLocation).toHaveBeenCalledWith(actor, 'loc-1');
    expect(item.quantity).toBe(92);
    expect(item.save).toHaveBeenCalled();
    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        stockItemId: 'stock-1',
        type: StockMovementType.Inventory,
        quantityChange: -8,
        quantity: 8,
        quantityBefore: 100,
        quantityAfter: 92,
        reason: 'Inventur',
        valueNet: 20,
        actorId: 'user-1',
      }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-1',
        tenantId: 'tenant-1',
        action: 'stock.adjusted',
        entityType: 'stock_item',
        entityId: 'stock-1',
        metadata: expect.objectContaining({
          oldQuantity: 100,
          newQuantity: 92,
          difference: -8,
          reason: 'Inventur',
        }),
      }),
    );
    expect(result.item.quantity).toBe(92);
    expect(result.movement?.quantityChange).toBe(-8);
  });

  it('increases stock from actual quantity and updates valuation', async () => {
    const item = stockItem({ quantity: 4, averageCost: 3 });
    mockFindItem(item);
    mockBatches([]);
    movementModel.create.mockResolvedValue(
      movement({ quantityBefore: 4, quantityAfter: 7, quantityChange: 3 }),
    );

    await service.adjust(
      'stock-1',
      {
        type: StockMovementType.Correction,
        actualQuantity: 7,
        reason: 'Fehlbuchung',
      },
      actor,
    );

    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityChange: 3,
        quantity: 3,
        valueNet: 9,
      }),
    );
  });

  it('requires a reason for inventory and correction movements', async () => {
    mockFindItem(stockItem({ quantity: 10 }));

    await expect(
      service.adjust(
        'stock-1',
        { type: StockMovementType.Inventory, actualQuantity: 8 },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(movementModel.create).not.toHaveBeenCalled();
    expect(auditLogModel.create).not.toHaveBeenCalled();
  });

  it('blocks cross-location adjustments through access policy', async () => {
    mockFindItem(stockItem({ quantity: 10 }));
    accessPolicy.assertCanAccessLocation.mockRejectedValue(
      new ForbiddenException('blocked'),
    );

    await expect(
      service.adjust(
        'stock-1',
        {
          type: StockMovementType.Correction,
          actualQuantity: 8,
          reason: 'Inventur',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(movementModel.create).not.toHaveBeenCalled();
  });

  function mockFindItem(item: ReturnType<typeof stockItem>) {
    stockItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(item),
    });
  }

  function mockBatches(batches: unknown[]) {
    batchModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(batches),
      }),
    });
  }

  function stockItem(overrides: Partial<Record<string, unknown>> = {}) {
    const item = {
      _id: { toString: () => 'stock-1' },
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      name: 'Pommes',
      category: 'Food',
      unit: 'kg',
      quantity: 10,
      minQuantity: 1,
      criticalQuantity: 0,
      isActive: true,
      isArchived: false,
      averageCost: 2,
      supplierId: 'supplier-1',
      supplierName: 'Demo Supplier',
      save: jest.fn(),
      ...overrides,
    };
    item.save.mockResolvedValue(item);
    return item;
  }

  function movement(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      _id: { toString: () => 'movement-1' },
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      stockItemId: 'stock-1',
      stockItemName: 'Pommes',
      type: StockMovementType.Inventory,
      quantityChange: -2,
      quantity: 2,
      unit: 'kg',
      quantityBefore: 10,
      quantityAfter: 8,
      unitPriceNet: 2,
      valueNet: 4,
      reason: 'Inventur',
      actorId: 'user-1',
      ...overrides,
    };
  }
});
