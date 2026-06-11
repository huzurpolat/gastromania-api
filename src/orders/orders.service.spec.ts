import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RestaurantTable, TableStatus } from '../tables/schemas/table.schema';
import { TableStatusLog } from '../tables/schemas/table-status-log.schema';
import { KdsStatusLog } from '../kds/schemas/kds-status-log.schema';
import { MenuItem } from '../menu-items/schemas/menu-item.schema';
import { OrdersService } from './orders.service';
import {
  Order,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
} from './schemas/order.schema';

describe('OrdersService', () => {
  let service: OrdersService;
  const tenantId = 'tenant-1';
  const locationId = '507f1f77bcf86cd799439012';
  const tableId = '507f1f77bcf86cd799439013';
  const orderModel = {
    create: jest.fn(),
    countDocuments: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
  };
  const menuItemModel = {
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
    assertLocationExistsAndReadable: jest.fn(),
    canAccessLocation: jest.fn(),
    getScopedResourceFilter: jest.fn(),
    isPlatformAdmin: jest.fn(),
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
            tenantId,
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
    menuItemModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([]),
    });
    tableModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => tableId },
        tenantId,
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
    accessPolicy.assertLocationExistsAndReadable.mockResolvedValue({
      _id: { toString: () => locationId },
      tenantId,
      locationId,
    });
    accessPolicy.canAccessLocation.mockResolvedValue(true);
    accessPolicy.getScopedResourceFilter.mockResolvedValue({ locationId });
    accessPolicy.isPlatformAdmin.mockReturnValue(false);
    logModel.create.mockResolvedValue({});
    tableStatusLogModel.create.mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(MenuItem.name), useValue: menuItemModel },
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
        tenantId,
      },
    );

    expect(order).toEqual(
      expect.objectContaining({
        companyId: 'company-1',
        tenantId,
        source: OrderSource.Internal,
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
      { returnDocument: 'after' },
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      'order.created',
      order,
    );
    expect(recipeInventoryService.consumeOrder).not.toHaveBeenCalled();
  });

  it('stores selected extras and calculates the item price on the server', async () => {
    const menuItemId = '507f1f77bcf86cd799439099';
    menuItemModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          _id: { toString: () => menuItemId },
          id: menuItemId,
          name: 'Cheese Burger',
          category: 'Burger',
          price: 10,
          sellingPrice: 11,
          isKitchenItem: true,
          isActive: true,
          extras: [
            {
              id: 'extra-cheese',
              name: 'Extra Kaese',
              priceDelta: 1.5,
              isAvailable: true,
              sendToKitchen: true,
            },
            {
              id: 'coupon-note',
              name: 'Kassenhinweis',
              priceDelta: 0,
              isAvailable: true,
              sendToKitchen: false,
            },
          ],
        },
      ]),
    });

    const order = await service.create(
      {
        locationId,
        items: [
          {
            menuItemId,
            name: 'Manipulierter Name',
            quantity: 2,
            price: 0,
            isKitchenItem: true,
            selectedExtraIds: ['extra-cheese', 'coupon-note'],
          },
        ],
      },
      {
        sub: 'waiter-1',
        email: 'service@test.local',
        roles: [],
        companyId: 'company-1',
        tenantId,
      },
    );

    expect(order.items[0]).toEqual(
      expect.objectContaining({
        menuItemId,
        name: 'Cheese Burger',
        price: 12.5,
        totalPrice: 25,
        selectedExtras: [
          {
            extraId: 'extra-cheese',
            name: 'Extra Kaese',
            priceDelta: 1.5,
            sendToKitchen: true,
          },
          {
            extraId: 'coupon-note',
            name: 'Kassenhinweis',
            priceDelta: 0,
            sendToKitchen: false,
          },
        ],
      }),
    );
    expect(order.total).toBe(25);
  });

  it('rejects unavailable extras', async () => {
    const menuItemId = '507f1f77bcf86cd799439098';
    menuItemModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          _id: { toString: () => menuItemId },
          id: menuItemId,
          name: 'Pommes',
          category: 'Beilagen',
          price: 4,
          isKitchenItem: true,
          isActive: true,
          extras: [
            {
              id: 'cheese-sauce',
              name: 'Kaese-Sauce',
              priceDelta: 1,
              isAvailable: false,
              sendToKitchen: true,
            },
          ],
        },
      ]),
    });

    await expect(
      service.create(
        {
          locationId,
          items: [
            {
              menuItemId,
              name: 'Pommes',
              quantity: 1,
              price: 4,
              isKitchenItem: true,
              selectedExtraIds: ['cheese-sauce'],
            },
          ],
        },
        {
          sub: 'waiter-1',
          email: 'service@test.local',
          roles: [],
          companyId: 'company-1',
          tenantId,
        },
      ),
    ).rejects.toThrow('nicht verfuegbar');
  });

  it('deducts inventory exactly once when an order is sent to kitchen', async () => {
    const currentOrder = {
      _id: { toString: () => '507f1f77bcf86cd799439014' },
      companyId: 'company-1',
      tenantId,
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
      tenantId,
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
      tenantId,
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
        tenantId,
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

  it('moves the parent order to preparing as soon as one item is started', async () => {
    const order = {
      _id: { toString: () => '507f1f77bcf86cd799439014' },
      companyId: 'company-1',
      tenantId,
      locationId,
      tableId,
      orderNumber: 'B0002',
      status: OrderStatus.New,
      statusTimestamps: {},
      items: [
        {
          _id: { toString: () => '507f1f77bcf86cd799439015' },
          name: 'Burger',
          quantity: 1,
          price: 12,
          status: OrderItemStatus.Open,
        },
        {
          _id: { toString: () => '507f1f77bcf86cd799439016' },
          name: 'Cola',
          quantity: 1,
          price: 3,
          status: OrderItemStatus.Open,
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

    const updated = await service.updateItemStatus(
      '507f1f77bcf86cd799439014',
      '507f1f77bcf86cd799439015',
      { status: OrderItemStatus.Started },
      {
        sub: 'kitchen-1',
        email: 'kueche@test.local',
        roles: [Role.Kueche],
        companyId: 'company-1',
        tenantId,
      },
    );

    expect(updated.status).toBe(OrderStatus.Preparing);
    expect(order.items[0]).toEqual(
      expect.objectContaining({
        status: OrderItemStatus.Started,
        startedBy: 'kitchen-1',
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

  it('keeps mixed ready and open items in preparing instead of falling back to new', async () => {
    const order = {
      _id: { toString: () => '507f1f77bcf86cd799439014' },
      companyId: 'company-1',
      tenantId,
      locationId,
      tableId,
      orderNumber: 'B0003',
      status: OrderStatus.Preparing,
      statusTimestamps: {},
      items: [
        {
          _id: { toString: () => '507f1f77bcf86cd799439015' },
          name: 'Burger',
          quantity: 1,
          price: 12,
          status: OrderItemStatus.Open,
        },
        {
          _id: { toString: () => '507f1f77bcf86cd799439016' },
          name: 'Cola',
          quantity: 1,
          price: 3,
          status: OrderItemStatus.Open,
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

    const updated = await service.updateItemStatus(
      '507f1f77bcf86cd799439014',
      '507f1f77bcf86cd799439015',
      { status: OrderItemStatus.Ready },
      {
        sub: 'kitchen-1',
        email: 'kueche@test.local',
        roles: [Role.Kueche],
        companyId: 'company-1',
        tenantId,
      },
    );

    expect(updated.status).toBe(OrderStatus.Preparing);
  });

  it('blocks platform admins from operative order access', async () => {
    accessPolicy.isPlatformAdmin.mockReturnValue(true);

    await expect(
      service.create(
        {
          locationId,
          items: [
            { name: 'Cola', quantity: 1, price: 3, isKitchenItem: false },
          ],
        },
        {
          sub: 'platform-1',
          email: 'platform@test.local',
          roles: [Role.PlatformAdminCode],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
