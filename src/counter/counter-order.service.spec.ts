import { BadRequestException } from '@nestjs/common';
import { CounterOrderService } from './counter-order.service';
import {
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  ProductionArea,
} from '../orders/schemas/order.schema';
import { Role } from '../auth/enums/role.enum';

describe('CounterOrderService', () => {
  const orderModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
  };
  const menuItemModel = {
    find: jest.fn(),
  };
  const logModel = {
    create: jest.fn(),
  };
  const pickupNumbers = {
    nextPickupNumber: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
  };
  const payments = {
    pay: jest.fn(),
  };
  const recipeInventoryService = {
    consumeOrder: jest.fn(),
    reverseOrder: jest.fn(),
  };
  const realtimeService = {
    publish: jest.fn(),
  };
  const accessPolicy = {
    assertCanAccessLocation: jest.fn(),
    getScopedResourceFilter: jest.fn(),
    canAccessLocation: jest.fn(),
  };
  const actor = {
    sub: 'user-1',
    email: 'service@test.local',
    roles: [Role.Service],
    companyId: 'company-1',
    locationIds: ['64f000000000000000000001'],
  };
  const locationId = '64f000000000000000000001';
  const menuItemId = '64f000000000000000000101';

  const execResult = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

  const service = () =>
    new CounterOrderService(
      orderModel as never,
      menuItemModel as never,
      logModel as never,
      pickupNumbers as never,
      payments as never,
      recipeInventoryService as never,
      realtimeService as never,
      accessPolicy as never,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    accessPolicy.assertCanAccessLocation.mockResolvedValue(undefined);
    pickupNumbers.nextPickupNumber.mockResolvedValue('A001');
    menuItemModel.find.mockReturnValue(
      execResult([
        {
          _id: { toString: () => menuItemId },
          name: 'Cheeseburger',
          category: 'Burger',
          price: 9.9,
          sellingPrice: 10.5,
          isKitchenItem: true,
        },
      ]),
    );
    recipeInventoryService.consumeOrder.mockResolvedValue({
      movementIds: ['movement-1'],
      warnings: [],
    });
  });

  it('creates counter orders as real orders and deducts inventory once', async () => {
    const createdOrder = {
      _id: { toString: () => 'order-1' },
      companyId: 'company-1',
      locationId,
      source: OrderSource.Counter,
      pickupNumber: 'A001',
      orderNumber: 'TA001',
      status: OrderStatus.Accepted,
      paymentStatus: PaymentStatus.Open,
      total: 21,
      items: [
        {
          menuItemId,
          name: 'Cheeseburger',
          quantity: 2,
          price: 10.5,
          totalPrice: 21,
          status: OrderItemStatus.Open,
          productionArea: ProductionArea.Kitchen,
        },
      ],
      inventoryMovementIds: [],
      inventoryWarnings: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    orderModel.create.mockResolvedValue(createdOrder);

    const order = await service().create(
      {
        locationId,
        items: [{ menuItemId, quantity: 2 }],
      },
      actor,
    );

    expect(order.source).toBe(OrderSource.Counter);
    expect(order.pickupNumber).toBe('A001');
    expect(recipeInventoryService.consumeOrder).toHaveBeenCalledTimes(1);
    expect(createdOrder.inventoryDeducted).toBe(true);
  });

  it('rejects invalid status transitions', () => {
    const counterService = service() as unknown as {
      assertStatusTransition(from: OrderStatus, to: OrderStatus): void;
    };

    expect(() =>
      counterService.assertStatusTransition(OrderStatus.Closed, OrderStatus.Ready),
    ).toThrow(BadRequestException);
  });
});
