import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { OrdersService } from '../orders/orders.service';
import { Checklist } from '../checklists/schemas/checklist.schema';
import { Location } from '../locations/schemas/location.schema';
import { MenuItem } from '../menu-items/schemas/menu-item.schema';
import { Order } from '../orders/schemas/order.schema';
import { Reservation } from '../reservations/schemas/reservation.schema';
import { RestaurantTable } from '../tables/schemas/table.schema';
import { MobileService } from './mobile.service';

const queryModel = () => ({
  find: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([]),
  exec: jest.fn().mockResolvedValue([]),
  findById: jest.fn(),
});

describe('MobileService', () => {
  let service: MobileService;
  const ordersService = {
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        MobileService,
        { provide: getModelToken(Location.name), useValue: queryModel() },
        {
          provide: getModelToken(RestaurantTable.name),
          useValue: queryModel(),
        },
        { provide: getModelToken(Order.name), useValue: queryModel() },
        { provide: getModelToken(Reservation.name), useValue: queryModel() },
        { provide: getModelToken(Checklist.name), useValue: queryModel() },
        { provide: getModelToken(MenuItem.name), useValue: queryModel() },
        { provide: OrdersService, useValue: ordersService },
      ],
    }).compile();

    service = moduleRef.get(MobileService);
  });

  it('creates mobile orders with the signed in employee', async () => {
    ordersService.create.mockResolvedValue({ _id: 'order-1' });

    await service.createOrder(
      {
        sub: 'u1',
        email: 'service@test.local',
        roles: ['Service'],
        locationIds: ['loc-1'],
      },
      {
        locationId: 'loc-1',
        tableId: 'table-1',
        items: [{ name: 'Cola', quantity: 2, price: 3, isKitchenItem: false }],
      },
    );

    expect(ordersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: 'u1',
        employeeName: 'service@test.local',
      }),
      expect.objectContaining({
        sub: 'u1',
        email: 'service@test.local',
      }),
    );
  });

  it('rejects mobile orders outside the employee location scope', async () => {
    await expect(
      service.createOrder(
        {
          sub: 'u1',
          email: 'service@test.local',
          roles: ['Service'],
          locationIds: ['loc-1'],
        },
        {
          locationId: 'loc-2',
          items: [
            { name: 'Cola', quantity: 1, price: 3, isKitchenItem: false },
          ],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
