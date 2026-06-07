import { OrderTenantBackfillService } from './order-tenant-backfill.service';
import { OrderTenantResolutionStatus } from './schemas/order.schema';

const queryResult = <T>(value: T) => {
  const query = {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };

  return query;
};

describe('OrderTenantBackfillService', () => {
  it('resolves legacy orders only with unique location/table tenant evidence and marks unsafe orders as legacy orphan', async () => {
    const orderModel = {
      find: jest.fn().mockReturnValue(
        queryResult([
          { _id: 'order-location', locationId: 'loc-a' },
          { _id: 'order-table', tableId: 'table-b' },
          {
            _id: 'order-conflicting-candidates',
            locationId: 'loc-a',
            tableId: 'table-b',
          },
          { _id: 'order-ambiguous-table', tableId: 'table-conflict' },
          { _id: 'order-orphan' },
        ]),
      ),
      updateOne: jest.fn().mockReturnValue(queryResult({ modifiedCount: 1 })),
      countDocuments: jest.fn().mockReturnValue(queryResult(0)),
    };
    const locationModel = {
      find: jest.fn().mockReturnValue(
        queryResult([
          { _id: 'loc-a', tenantId: 'tenant-a' },
          { _id: 'loc-b', tenantId: 'tenant-b' },
        ]),
      ),
    };
    const tableModel = {
      find: jest.fn().mockReturnValue(
        queryResult([
          { _id: 'table-a', tenantId: 'tenant-a', locationId: 'loc-a' },
          { _id: 'table-b', locationId: 'loc-b' },
          {
            _id: 'table-conflict',
            tenantId: 'tenant-a',
            locationId: 'loc-b',
          },
        ]),
      ),
    };
    const service = new OrderTenantBackfillService(
      orderModel as never,
      locationModel as never,
      tableModel as never,
    );

    await service.onApplicationBootstrap();

    expect(orderModel.updateOne).toHaveBeenCalledWith(
      { _id: 'order-location' },
      expect.objectContaining({
        $set: expect.objectContaining({
          tenantId: 'tenant-a',
          tenantResolutionStatus: OrderTenantResolutionStatus.Resolved,
        }),
      }),
    );
    expect(orderModel.updateOne).toHaveBeenCalledWith(
      { _id: 'order-table' },
      expect.objectContaining({
        $set: expect.objectContaining({
          tenantId: 'tenant-b',
          tenantResolutionStatus: OrderTenantResolutionStatus.Resolved,
        }),
      }),
    );
    expect(orderModel.updateOne).toHaveBeenCalledWith(
      { _id: 'order-conflicting-candidates' },
      expect.objectContaining({
        $set: expect.objectContaining({
          tenantResolutionStatus: OrderTenantResolutionStatus.LegacyOrphan,
          tenantResolutionReason:
            'locationId und tableId liefern unterschiedliche Tenant-Kandidaten',
        }),
      }),
    );
    expect(orderModel.updateOne).toHaveBeenCalledWith(
      { _id: 'order-ambiguous-table' },
      expect.objectContaining({
        $set: expect.objectContaining({
          tenantResolutionStatus: OrderTenantResolutionStatus.LegacyOrphan,
          tenantResolutionReason:
            'tableId verweist auf widerspruechliche Tenant-Zuordnungen',
        }),
      }),
    );
    expect(orderModel.updateOne).toHaveBeenCalledWith(
      { _id: 'order-orphan' },
      expect.objectContaining({
        $set: expect.objectContaining({
          tenantResolutionStatus: OrderTenantResolutionStatus.LegacyOrphan,
          tenantResolutionReason:
            'locationId/tableId konnten keinem Tenant eindeutig zugeordnet werden',
        }),
      }),
    );
  });
});
