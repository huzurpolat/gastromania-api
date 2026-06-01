import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RestaurantTable, TableStatus } from '../tables/schemas/table.schema';
import { OrdersService } from './orders.service';
import { Order, OrderStatus } from './schemas/order.schema';

describe('OrdersService', () => {
  let service: OrdersService;
  const locationId = '507f1f77bcf86cd799439012';
  const tableId = '507f1f77bcf86cd799439013';
  const orderModel = {
    create: jest.fn(),
    countDocuments: jest.fn(),
  };
  const tableModel = {
    findByIdAndUpdate: jest.fn(),
  };
  const realtimeService = {
    publish: jest.fn(),
  };
  const recipeInventoryService = {
    consumeOrder: jest.fn(),
  };
  const accessPolicy = {
    assertCanAccessLocation: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    orderModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(0),
    });
    orderModel.create.mockImplementation(async (payload: Record<string, unknown>) => ({
      _id: { toString: () => '507f1f77bcf86cd799439014' },
      ...payload,
      deleteOne: jest.fn(),
    }));
    tableModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({}),
    });
    recipeInventoryService.consumeOrder.mockResolvedValue(undefined);
    accessPolicy.assertCanAccessLocation.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(RestaurantTable.name), useValue: tableModel },
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
      { status: TableStatus.Ordering },
      { new: true },
    );
    expect(realtimeService.publish).toHaveBeenCalledWith('order.created', order);
  });
});
