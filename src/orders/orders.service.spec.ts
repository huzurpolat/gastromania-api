import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RestaurantTable, TableStatus } from '../tables/schemas/table.schema';
import { TableStatusLog } from '../tables/schemas/table-status-log.schema';
import { KdsStatusLog } from '../kds/schemas/kds-status-log.schema';
import { OrdersService } from './orders.service';
import { Order, OrderItemStatus, OrderStatus } from './schemas/order.schema';

describe('OrdersService', () => {
  let service: OrdersService;
  const locationId = '507f1f77bcf86cd799439012';
  const tableId = '507f1f77bcf86cd799439013';
  const orderModel = {
    create: jest.fn(),
    countDocuments: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
  };
  const logModel = {
    create: jest.fn(),
  };
  const tableStatusLogModel = {
    create: jest.fn(),
  };
  const tableModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const realtimeService = {
    publish: jest.fn(),
  };
  const recipeInventoryService = {
    consumeOrder: jest.fn(),
    reverseOrder: jest.fn(),
    adjustOrder: jest.fn(),
  };
  const accessPolicy = {
    assertCanAccessLocation: jest.fn(),
    canAccessLocation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    orderModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });
    orderModel.create.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve({
        _id: { toString: () => '507f1f77bcf86cd799439014' },
        ...payload,
        save: jest.fn().mockResolvedValue(undefined),
        deleteOne: jest.fn(),
      }),
    );
    orderModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: { toString: () => '507f1f77bcf86cd799439014' },
            locationId,
            tableId,
            status: OrderStatus.New,
            paymentStatus: undefined,
            total: 19,
            guestCount: 4,
            assignedWaiterId: 'waiter-1',
            statusTimestamps: {
              [OrderStatus.New]: new Date('2026-01-01T10:00:00Z'),
            },
          },
        ]),
      }),
    });
    tableModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => tableId },
        name: 'Fenster 01',
        locationId,
        status: TableStatus.Free,
      }),
    });
    tableModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => tableId },
        name: 'Fenster 01',
        locationId,
        status: TableStatus.Ordering,
        activeOrderIds: ['507f1f77bcf86cd799439014'],
        currentTotal: 19,
        guestCount: 4,
      }),
    });
    recipeInventoryService.consumeOrder.mockResolvedValue({
      movementIds: ['mov-1'],
      warnings: [],
    });
    recipeInventoryService.reverseOrder.mockResolvedValue({
      movementIds: ['mov-2'],
      warnings: [],
    });
    recipeInventoryService.adjustOrder.mockResolvedValue({
      movementIds: ['mov-3'],
      warnings: [],
    });
    accessPolicy.assertCanAccessLocation.mockResolvedValue(undefined);
    accessPolicy.canAccessLocation.mockResolvedValue(true);
    logModel.create.mockResolvedValue({});
    tableStatusLogModel.create.mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(RestaurantTable.name), useValue: tableModel },
        {
          provide: getModelToken(TableStatusLog.name),
          useValue: tableStatusLogModel,
        },
        { provide: getModelToken(KdsStatusLog.name), useValue: logModel },
        { provide: RealtimeService, useValue: realtimeService },
        { provide: RecipeInventoryService, useValue: recipeInventoryService },
        { provide: AccessPolicyService, useValue: accessPolicy },
      ],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  it('creates a table-bound order with guest count, totals, waiter and table status', async () => {
    const order = await service.create(
      {
        locationId,
        tableId,
        guestCount: 4,
        items: [
          { name: 'Cola', quantity: 2, price: 3.5, isKitchenItem: false },
          { name: 'Burger', quantity: 1, price: 12, isKitchenItem: true },
        ],
      },
      {
        sub: 'waiter-1',
        email: 'service@test.local',
        roles: [],
        companyId: 'company-1',
      },
    );

    expect(order).toEqual(
      expect.objectContaining({
        companyId: 'company-1',
        createdBy: 'waiter-1',
        assignedWaiterId: 'waiter-1',
        guestCount: 4,
        status: OrderStatus.New,
        subtotal: 19,
        total: 19,
      }),
    );
    expect(order.items[0]).toEqual(expect.objectContaining({ totalPrice: 7 }));
    expect(tableModel.findByIdAndUpdate).toHaveBeenCalledWith(
      tableId,
      expect.objectContaining({ status: TableStatus.Ordering }),
      { new: true },
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      'order.created',
      order,
    );
    expect(recipeInventoryService.consumeOrder).not.toHaveBeenCalled();
  });

  it('deducts inventory exactly once when an order is sent to kitchen', async () => {
    const currentOrder = {
      _id: { toString: () => '507f1f77bcf86cd799439014' },
      companyId: 'company-1',
      locationId,
      tableId,
      status: OrderStatus.New,
      paymentStatus: undefined,
      statusTimestamps: {},
      inventoryDeducted: false,
      items: [{ name: 'Burger', quantity: 2, price: 12, isKitchenItem: true }],
      save: jest.fn(),
    };
    const updatedOrder = {
      ...currentOrder,
      status: OrderStatus.Accepted,
      statusTimestamps: { [OrderStatus.Accepted]: new Date() },
      inventoryMovementIds: [],
      inventoryWarnings: [],
      save: jest.fn(),
    };
    updatedOrder.save.mockResolvedValue(updatedOrder);
    orderModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(currentOrder),
    });
    orderModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(updatedOrder),
    });
    orderModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([updatedOrder]),
      }),
    });

    const result = await service.sendToKitchen('507f1f77bcf86cd799439014', {
      sub: 'waiter-1',
      email: 'service@test.local',
      roles: [Role.Service],
      companyId: 'company-1',
    });

    expect(result.status).toBe(OrderStatus.Accepted);
    expect(recipeInventoryService.consumeOrder).toHaveBeenCalledWith(
      updatedOrder,
      'waiter-1',
    );
    expect(updatedOrder.inventoryDeducted).toBe(true);
    expect(updatedOrder.inventoryMovementIds).toEqual(['mov-1']);
  });

  it('aggregates order status from item status changes and writes an audit log', async () => {
    const order = {
      _id: { toString: () => '507f1f77bcf86cd799439014' },
      companyId: 'company-1',
      locationId,
      tableId,
      orderNumber: 'B0001',
      status: OrderStatus.Preparing,
      statusTimestamps: {},
      items: [
        {
          _id: { toString: () => '507f1f77bcf86cd799439015' },
          name: 'Burger',
          quantity: 1,
          price: 12,
          status: OrderItemStatus.Ready,
        },
        {
          _id: { toString: () => '507f1f77bcf86cd799439016' },
          name: 'Pommes',
          quantity: 1,
          price: 5,
          status: OrderItemStatus.Preparing,
        },
      ],
      save: jest.fn(),
    };
    order.save.mockResolvedValue(order);
    orderModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(order),
    });
    orderModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([order]),
      }),
    });
    tableModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => tableId },
        name: 'Fenster 01',
        locationId,
        status: TableStatus.ReadyToServe,
        activeOrderIds: ['507f1f77bcf86cd799439014'],
        currentTotal: 17,
        guestCount: 0,
      }),
    });

    const updated = await service.updateItemStatus(
      '507f1f77bcf86cd799439014',
      '507f1f77bcf86cd799439016',
      { status: OrderItemStatus.Ready, note: 'fertig' },
      {
        sub: 'kitchen-1',
        email: 'kueche@test.local',
        roles: [Role.Kueche],
        companyId: 'company-1',
      },
    );

    expect(updated.status).toBe(OrderStatus.Ready);
    expect(order.items[1]).toEqual(
      expect.objectContaining({
        status: OrderItemStatus.Ready,
        readyBy: 'kitchen-1',
      }),
    );
    expect(logModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'order.item.status.changed',
        itemId: '507f1f77bcf86cd799439016',
        fromStatus: OrderItemStatus.Preparing,
        toStatus: OrderItemStatus.Ready,
        comment: 'fertig',
      }),
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      'order.item.status.changed',
      expect.objectContaining({
        locationId,
        itemName: 'Pommes',
        newStatus: OrderItemStatus.Ready,
        orderStatus: OrderStatus.Ready,
      }),
    );
  });
});
