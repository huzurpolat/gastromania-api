import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, OrderStatus } from '../orders/schemas/order.schema';
import { LoyaltyService } from './loyalty.service';
import { GuestLoyaltyTier } from './schemas/guest-loyalty-account.schema';
import {
  GuestVoucherStatus,
  GuestVoucherType,
} from './schemas/guest-voucher.schema';

describe('LoyaltyService', () => {
  const guestId = '507f1f77bcf86cd799439011';
  const actor = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    roles: ['TenantAdmin'],
    permissions: ['reservations.view', 'reservations.create'],
  };

  function chain<T>(value: T) {
    return {
      sort: jest.fn(() => ({
        lean: jest.fn(async () => value),
      })),
      lean: jest.fn(async () => value),
      exec: jest.fn(async () => value),
    };
  }

  function createService(options: { transactionExists?: boolean } = {}) {
    const createdTransactions: unknown[] = [];
    const accountUpdates: unknown[] = [];
    const voucherDoc = {
      _id: '507f1f77bcf86cd799439022',
      tenantId: 'tenant-1',
      code: 'WELCOME10',
      value: 10,
      type: GuestVoucherType.Amount,
      status: GuestVoucherStatus.Active,
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      save: jest.fn(async function save(this: unknown) {
        return this;
      }),
    };
    const accountModel = {
      find: jest.fn(() => chain([])),
      findOne: jest.fn(() => ({ exec: jest.fn(async () => null) })),
      create: jest.fn(async (payload) => ({ _id: 'account-1', ...payload })),
      findOneAndUpdate: jest.fn((_query, payload) => ({
        lean: jest.fn(async () => {
          accountUpdates.push(payload);
          return { _id: 'account-1', guestProfileId: guestId, ...payload };
        }),
      })),
      countDocuments: jest.fn(async () => 0),
    };
    const transactionModel = {
      exists: jest.fn(async () => options.transactionExists ?? false),
      create: jest.fn(async (payload) => {
        createdTransactions.push(payload);
        return payload;
      }),
      find: jest.fn(() => chain(createdTransactions)),
    };
    const voucherModel = {
      find: jest.fn(() => chain([])),
      aggregate: jest.fn(async () => []),
      countDocuments: jest.fn(async () => 0),
      create: jest.fn(async (payload) => ({ _id: 'voucher-1', ...payload })),
      findById: jest.fn(() => ({ exec: jest.fn(async () => voucherDoc) })),
      findByIdAndUpdate: jest.fn((_id, payload) => ({ exec: jest.fn(async () => payload) })),
      updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
    };
    const guestModel = {
      find: jest.fn(() => chain([{ _id: guestId, tenantId: 'tenant-1', active: true }])),
      findById: jest.fn(() => ({
        exec: jest.fn(async () => ({
          _id: guestId,
          tenantId: 'tenant-1',
          locationId: 'location-1',
        })),
        lean: jest.fn(async () => ({
          _id: guestId,
          tenantId: 'tenant-1',
          locationId: 'location-1',
        })),
      })),
    };
    const orderModel = {
      find: jest.fn(() => ({
        lean: jest.fn(async () => [
          {
            _id: '507f1f77bcf86cd799439033',
            tenantId: 'tenant-1',
            locationId: 'location-1',
            guestProfileId: guestId,
            paymentStatus: PaymentStatus.Paid,
            status: OrderStatus.Closed,
            total: 1600,
            refundTotal: 0,
          },
        ]),
      })),
      aggregate: jest.fn(async () => [{ revenue: 1600, visits: 1 }]),
    };
    const accessPolicy = {
      assertCanAccessLocation: jest.fn(async () => undefined),
      canAccessLocation: jest.fn(async () => true),
      getScopedResourceFilter: jest.fn(async () => ({})),
    };

    const service = new LoyaltyService(
      accountModel as never,
      transactionModel as never,
      voucherModel as never,
      guestModel as never,
      orderModel as never,
      accessPolicy as never,
    );

    return {
      service,
      createdTransactions,
      accountUpdates,
      voucherDoc,
      transactionModel,
    };
  }

  it('syncs paid POS orders into points once and promotes VIP tier', async () => {
    const { service, createdTransactions, accountUpdates } = createService();

    const result = await service.getAccount(guestId, actor as never);

    expect(createdTransactions).toHaveLength(1);
    expect(createdTransactions[0]).toMatchObject({
      guestProfileId: guestId,
      points: 1600,
      type: 'EARNED',
    });
    expect(accountUpdates.at(-1)).toMatchObject({
      pointsBalance: 1600,
      lifetimePoints: 1600,
      lifetimeRevenue: 1600,
      totalVisits: 1,
      tier: GuestLoyaltyTier.Gold,
    });
    expect(result.account?.tier).toBe(GuestLoyaltyTier.Gold);
  });

  it('does not duplicate earned transactions for the same order', async () => {
    const { service, createdTransactions } = createService({
      transactionExists: true,
    });

    await service.getAccount(guestId, actor as never);

    expect(createdTransactions).toHaveLength(0);
  });

  it('redeems active vouchers and rejects inactive vouchers', async () => {
    const { service, voucherDoc } = createService();

    const redeemed = await service.redeemVoucher(
      '507f1f77bcf86cd799439022',
      { guestProfileId: guestId },
      actor as never,
    );

    expect(redeemed.status).toBe(GuestVoucherStatus.Redeemed);
    expect(voucherDoc.save).toHaveBeenCalled();

    await expect(
      service.redeemVoucher(
        '507f1f77bcf86cd799439022',
        { guestProfileId: guestId },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
