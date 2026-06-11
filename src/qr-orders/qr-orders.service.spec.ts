import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Company } from '../companies/schemas/company.schema';
import { Location } from '../locations/schemas/location.schema';
import { MenuItem } from '../menu-items/schemas/menu-item.schema';
import {
  DIGITAL_MENU_MODULE_KEY,
  QR_ORDERS_MODULE_KEY,
} from '../modules/constants/module-definitions';
import { ModulesService } from '../modules/modules.service';
import {
  Order,
  OrderSource,
  OrderStatus,
} from '../orders/schemas/order.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { RestaurantTable, TableStatus } from '../tables/schemas/table.schema';
import { QrOrdersService } from './qr-orders.service';

describe('QrOrdersService', () => {
  let service: QrOrdersService;
  const token = 'abcdefghijklmnopqrstuvwxyzABCDEF_1234567890';
  const tableId = '507f1f77bcf86cd799439013';
  const locationId = '507f1f77bcf86cd799439012';
  const tenantId = 'tenant-1';
  const companyId = 'company-1';
  const menuItemId = '507f1f77bcf86cd799439014';
  const table = {
    _id: { toString: () => tableId },
    name: 'Fenster 01',
    tableName: 'Fenster 01',
    locationId,
    companyId,
    seats: 2,
    qrToken: token,
    qrEnabled: true,
    qrTokenRevokedAt: undefined,
    isActive: true,
    activeOrderIds: [],
    currentTotal: 0,
    guestCount: 0,
  };
  const location = {
    _id: { toString: () => locationId },
    name: 'Bonn',
    city: 'Bonn',
    tenantId,
    companyId,
    isActive: true,
  };
  const company = {
    _id: { toString: () => companyId },
    name: 'Gastromania NRW',
    isActive: true,
  };
  const menuItem = {
    _id: { toString: () => menuItemId },
    name: 'Cheeseburger',
    category: 'Burger',
    description: 'Mit Kaese',
    price: 12,
    sellingPrice: 14,
    isKitchenItem: true,
    isVegan: false,
    containsNuts: false,
    isActive: true,
    extras: [
      {
        id: 'extra-cheese',
        name: 'Extra Kaese',
        priceDelta: 1.5,
        isAvailable: true,
        sendToKitchen: true,
        sortOrder: 1,
      },
    ],
  };
  const tableModel = {
    findOne: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const locationModel = {
    findById: jest.fn(),
  };
  const companyModel = {
    findById: jest.fn(),
  };
  const menuItemModel = {
    find: jest.fn(),
  };
  const orderModel = {
    create: jest.fn(),
    countDocuments: jest.fn(),
    findOne: jest.fn(),
  };
  const realtimeService = {
    publish: jest.fn(),
  };
  const modulesService = {
    assertEnabledForTenant: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tableModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(table),
    });
    tableModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        ...table,
        status: TableStatus.Ordering,
        activeOrderIds: ['order-1'],
        currentTotal: 14,
      }),
    });
    locationModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(location),
    });
    companyModel.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(company),
    });
    menuItemModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([menuItem]),
      }),
      lean: jest.fn().mockResolvedValue([menuItem]),
    });
    orderModel.countDocuments.mockResolvedValue(0);
    orderModel.create.mockImplementation((payload: Record<string, unknown>) =>
      Promise.resolve({
        _id: { toString: () => 'order-1' },
        ...payload,
      }),
    );
    orderModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: { toString: () => 'order-1' },
        orderNumber: 'QR0001',
        status: OrderStatus.New,
        total: 14,
        items: [{ name: 'Cheeseburger', quantity: 1, status: 'Offen' }],
      }),
    });
    modulesService.assertEnabledForTenant.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        QrOrdersService,
        { provide: getModelToken(RestaurantTable.name), useValue: tableModel },
        { provide: getModelToken(Location.name), useValue: locationModel },
        { provide: getModelToken(Company.name), useValue: companyModel },
        { provide: getModelToken(MenuItem.name), useValue: menuItemModel },
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: RealtimeService, useValue: realtimeService },
        { provide: ModulesService, useValue: modulesService },
      ],
    }).compile();

    service = moduleRef.get(QrOrdersService);
  });

  it('returns only public menu information for an active table token', async () => {
    const result = await service.getPublicMenu(token);

    expect(result.location.name).toBe('Bonn');
    expect(result.table.name).toBe('Fenster 01');
    expect(result.menu.items).toEqual([
      expect.objectContaining({
        id: menuItemId,
        name: 'Cheeseburger',
        price: 14,
        available: true,
        extras: [
          {
            id: 'extra-cheese',
            name: 'Extra Kaese',
            priceDelta: 1.5,
            sendToKitchen: true,
            sortOrder: 1,
          },
        ],
      }),
    ]);
    expect(result.menu.items[0]).not.toHaveProperty('recipeId');
    expect(modulesService.assertEnabledForTenant).toHaveBeenCalledWith(
      DIGITAL_MENU_MODULE_KEY,
      tenantId,
    );
  });

  it('rejects disabled or revoked table tokens', async () => {
    tableModel.findOne.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        ...table,
        qrEnabled: false,
      }),
    });

    await expect(service.getPublicMenu(token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates a QR order bound to table, location and company', async () => {
    const result = await service.createOrder(
      token,
      {
        customerName: 'Gast',
        guestNote: 'Bitte schnell',
        items: [
          {
            menuItemId,
            quantity: 2,
            note: 'ohne Zwiebeln',
            selectedExtraIds: ['extra-cheese'],
          },
        ],
      },
      { userAgent: 'jest' },
    );

    expect(result.orderNumber).toBe('QR0001');
    expect(orderModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId,
        tenantId,
        locationId,
        tableId,
        source: OrderSource.Qr,
        status: OrderStatus.New,
        customerName: 'Gast',
        total: 31,
        qrTokenId: token,
        items: [
          expect.objectContaining({
            price: 15.5,
            totalPrice: 31,
            selectedExtras: [
              {
                extraId: 'extra-cheese',
                name: 'Extra Kaese',
                priceDelta: 1.5,
                sendToKitchen: true,
              },
            ],
          }),
        ],
      }),
    );
    expect(tableModel.findByIdAndUpdate).toHaveBeenCalledWith(
      table._id,
      expect.objectContaining({
        status: TableStatus.Ordering,
        currentTotal: 31,
      }),
      { returnDocument: 'after' },
    );
    expect(realtimeService.publish).toHaveBeenCalledWith(
      'qr.order.created',
      expect.objectContaining({
        tableId,
        locationId,
      }),
    );
    expect(modulesService.assertEnabledForTenant).toHaveBeenCalledWith(
      QR_ORDERS_MODULE_KEY,
      tenantId,
    );
  });
});
