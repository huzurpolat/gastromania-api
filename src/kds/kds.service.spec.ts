import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { KdsService } from './kds.service';
import { KdsSettings } from './schemas/kds-settings.schema';
import { KdsStatusLog } from './schemas/kds-status-log.schema';
import { Role } from '../auth/enums/role.enum';
import {
  Order,
  OrderItemStatus,
  OrderStatus,
} from '../orders/schemas/order.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import { AccessPolicyService } from '../access/access-policy.service';
import { RestaurantTable, TableStatus } from '../tables/schemas/table.schema';
import { TableStatusLog } from '../tables/schemas/table-status-log.schema';

describe('KdsService', () => {
  let service: KdsService;
  const order = {
    _id: { toString: () => '507f1f77bcf86cd799439011' },
    locationId: '507f1f77bcf86cd799439012',
    status: OrderStatus.New,
    tableId: '507f1f77bcf86cd799439013',
    items: [] as Array<{
      _id: { toString: () => string };
      name: string;
      quantity: number;
      price: number;
      status: OrderItemStatus;
      [key: string]: unknown;
    }>,
    statusTimestamps: {},
    save: jest.fn(),
  };
  const orderModel = {
    findById: jest.fn(),
    find: jest.fn(),
  };
  const logModel = {
    create: jest.fn(),
    find: jest.fn(),
  };
  const tableStatusLogModel = {
    create: jest.fn(),
  };
  const tableModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const settingsModel = {
    findOneAndUpdate: jest.fn(),
  };
  const realtimeService = {
    publish: jest.fn(),
  };
  const recipeInventoryService = {
    consumeOrder: jest.fn(),
    reverseOrder: jest.fn(),
  };
  const accessPolicy = {
    canAccessLocation: jest.fn(),
    assertCanManageLocation: jest.fn(),
    getScopedResourceFilter: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    order.status = OrderStatus.New;
    order.items = [];
    order.statusTimestamps = {};
    delete (order as { inventoryDeducted?: boolean }).inventoryDeducted;
    delete (order as { inventoryConsumedAt?: Date }).inventoryConsumedAt;
    delete (order as { inventoryReversedAt?: Date }).inventoryReversedAt;
    (order as { inventoryMovementIds?: string[] }).inventoryMovementIds = [];
    (order as { inventoryWarnings?: string[] }).inventoryWarnings = [];
    order.save.mockResolvedValue(order);
    orderModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(order),
    });
    orderModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([order]),
      }),
    });
    logModel.create.mockResolvedValue({});
    tableStatusLogModel.create.mockResolvedValue({});
    tableModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => order.tableId },
        name: 'Fenster 01',
        locationId: order.locationId,
        status: TableStatus.Free,
      }),
    });
    tableModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => order.tableId },
        name: 'Fenster 01',
        locationId: order.locationId,
        status: TableStatus.OrderSent,
        activeOrderIds: [order._id.toString()],
        currentTotal: 0,
        guestCount: 0,
      }),
    });
    accessPolicy.canAccessLocation.mockResolvedValue(true);
    accessPolicy.assertCanManageLocation.mockResolvedValue(undefined);
    accessPolicy.getScopedResourceFilter.mockResolvedValue({});
    recipeInventoryService.consumeOrder.mockResolvedValue({
      movementIds: ['mov-1'],
      warnings: [],
    });
    recipeInventoryService.reverseOrder.mockResolvedValue({
      movementIds: ['mov-2'],
      warnings: [],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        KdsService,
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(RestaurantTable.name), useValue: tableModel },
        {
          provide: getModelToken(TableStatusLog.name),
          useValue: tableStatusLogModel,
        },
        { provide: getModelToken(KdsStatusLog.name), useValue: logModel },
        { provide: getModelToken(KdsSettings.name), useValue: settingsModel },
        { provide: RealtimeService, useValue: realtimeService },
        { provide: RecipeInventoryService, useValue: recipeInventoryService },
        { provide: AccessPolicyService, useValue: accessPolicy },
      ],
    }).compile();

    service = moduleRef.get(KdsService);
  });

  it('allows the configured KDS status workflow and emits realtime events', async () => {
    await expect(
      service.updateStatus(
        '507f1f77bcf86cd799439011',
        { status: OrderStatus.Accepted, employeeName: 'Klara' },
        { sub: 'user-1', email: 'kueche@test.local', roles: [] },
      ),
    ).resolves.toBe(order);

    expect(order.status).toBe(OrderStatus.Accepted);
    expect(recipeInventoryService.consumeOrder).toHaveBeenCalledWith(
      order,
      'user-1',
    );
    expect(order.inventoryDeducted).toBe(true);
    expect(logModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'order.statusChanged',
        fromStatus: OrderStatus.New,
        toStatus: OrderStatus.Accepted,
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      'order.statusChanged',
      order,
    );
    expect(tableModel.findByIdAndUpdate).toHaveBeenCalledWith(
      order.tableId,
      expect.objectContaining({ status: TableStatus.OrderSent }),
      { new: true },
    );
  });

  it('rejects invalid KDS status transitions', async () => {
    await expect(
      service.updateStatus(
        '507f1f77bcf86cd799439011',
        { status: OrderStatus.Ready },
        { sub: 'user-1', email: 'kueche@test.local', roles: [] },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sets the parent order to preparing when the first item is started', async () => {
    order.items = [
      {
        _id: { toString: () => 'item-1' },
        name: 'Burger',
        quantity: 1,
        price: 12,
        status: OrderItemStatus.Open,
      },
      {
        _id: { toString: () => 'item-2' },
        name: 'Pommes',
        quantity: 1,
        price: 5,
        status: OrderItemStatus.Open,
      },
    ];

    const updated = await service.updateItemStatus(
      '507f1f77bcf86cd799439011',
      'item-1',
      { status: OrderItemStatus.Started },
      { sub: 'user-1', email: 'kueche@test.local', roles: [Role.Kueche] },
    );

    expect(updated.status).toBe(OrderStatus.Preparing);
    expect(order.items[0]).toEqual(
      expect.objectContaining({
        status: OrderItemStatus.Started,
        startedBy: 'user-1',
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      'order.status.changed',
      expect.objectContaining({
        previousStatus: OrderStatus.New,
        newStatus: OrderStatus.Preparing,
      }),
    );
  });

  it('keeps the parent order in preparing while ready and open items are mixed', async () => {
    order.items = [
      {
        _id: { toString: () => 'item-1' },
        name: 'Burger',
        quantity: 1,
        price: 12,
        status: OrderItemStatus.Open,
      },
      {
        _id: { toString: () => 'item-2' },
        name: 'Pommes',
        quantity: 1,
        price: 5,
        status: OrderItemStatus.Open,
      },
    ];

    const updated = await service.updateItemStatus(
      '507f1f77bcf86cd799439011',
      'item-1',
      { status: OrderItemStatus.Ready },
      { sub: 'user-1', email: 'kueche@test.local', roles: [Role.Kueche] },
    );

    expect(updated.status).toBe(OrderStatus.Preparing);
  });

  it('sets the parent order to ready when all active items are ready', async () => {
    order.status = OrderStatus.Preparing;
    order.items = [
      {
        _id: { toString: () => 'item-1' },
        name: 'Burger',
        quantity: 1,
        price: 12,
        status: OrderItemStatus.Ready,
      },
      {
        _id: { toString: () => 'item-2' },
        name: 'Pommes',
        quantity: 1,
        price: 5,
        status: OrderItemStatus.Preparing,
      },
    ];

    const updated = await service.updateItemStatus(
      '507f1f77bcf86cd799439011',
      'item-2',
      { status: OrderItemStatus.Ready },
      { sub: 'user-1', email: 'kueche@test.local', roles: [Role.Kueche] },
    );

    expect(updated.status).toBe(OrderStatus.Ready);
  });

  it('sets the parent order to served when all active items are served', async () => {
    order.status = OrderStatus.Ready;
    order.items = [
      {
        _id: { toString: () => 'item-1' },
        name: 'Burger',
        quantity: 1,
        price: 12,
        status: OrderItemStatus.Served,
      },
      {
        _id: { toString: () => 'item-2' },
        name: 'Pommes',
        quantity: 1,
        price: 5,
        status: OrderItemStatus.Ready,
      },
    ];

    const updated = await service.updateItemStatus(
      '507f1f77bcf86cd799439011',
      'item-2',
      { status: OrderItemStatus.Served },
      { sub: 'service-1', email: 'service@test.local', roles: [Role.Service] },
    );

    expect(updated.status).toBe(OrderStatus.Served);
  });

  it('sets the parent order to cancelled when all items are cancelled', async () => {
    order.status = OrderStatus.Preparing;
    order.items = [
      {
        _id: { toString: () => 'item-1' },
        name: 'Burger',
        quantity: 1,
        price: 12,
        status: OrderItemStatus.Cancelled,
      },
      {
        _id: { toString: () => 'item-2' },
        name: 'Pommes',
        quantity: 1,
        price: 5,
        status: OrderItemStatus.Open,
      },
    ];

    const updated = await service.updateItemStatus(
      '507f1f77bcf86cd799439011',
      'item-2',
      { status: OrderItemStatus.Cancelled },
      { sub: 'user-1', email: 'kueche@test.local', roles: [Role.Kueche] },
    );

    expect(updated.status).toBe(OrderStatus.Cancelled);
  });
});
