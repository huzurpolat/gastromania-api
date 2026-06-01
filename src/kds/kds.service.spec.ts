import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { KdsService } from './kds.service';
import { KdsSettings } from './schemas/kds-settings.schema';
import { KdsStatusLog } from './schemas/kds-status-log.schema';
import { Order, OrderStatus } from '../orders/schemas/order.schema';
import { RealtimeService } from '../realtime/realtime.service';
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
    items: [],
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
  const accessPolicy = {
    canAccessLocation: jest.fn(),
    assertCanManageLocation: jest.fn(),
    getScopedResourceFilter: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    order.status = OrderStatus.New;
    order.statusTimestamps = {};
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        KdsService,
        { provide: getModelToken(Order.name), useValue: orderModel },
        { provide: getModelToken(RestaurantTable.name), useValue: tableModel },
        { provide: getModelToken(TableStatusLog.name), useValue: tableStatusLogModel },
        { provide: getModelToken(KdsStatusLog.name), useValue: logModel },
        { provide: getModelToken(KdsSettings.name), useValue: settingsModel },
        { provide: RealtimeService, useValue: realtimeService },
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
});
