import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  GuestProfile,
  GuestProfileDocument,
} from '../guests/schemas/guest-profile.schema';
import {
  Order,
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import {
  CreateGuestVoucherDto,
  RedeemGuestVoucherDto,
  UpdateGuestVoucherDto,
} from './dto/voucher.dto';
import {
  GuestLoyaltyAccount,
  GuestLoyaltyAccountDocument,
  GuestLoyaltyTier,
} from './schemas/guest-loyalty-account.schema';
import {
  GuestLoyaltyTransaction,
  GuestLoyaltyTransactionType,
} from './schemas/guest-loyalty-transaction.schema';
import {
  GuestVoucher,
  GuestVoucherDocument,
  GuestVoucherStatus,
} from './schemas/guest-voucher.schema';

const POINTS_PER_EURO = 1;
const TIER_THRESHOLDS: Array<{ tier: GuestLoyaltyTier; points: number }> = [
  { tier: GuestLoyaltyTier.Platinum, points: 5000 },
  { tier: GuestLoyaltyTier.Gold, points: 1500 },
  { tier: GuestLoyaltyTier.Silver, points: 500 },
  { tier: GuestLoyaltyTier.Bronze, points: 0 },
];

@Injectable()
export class LoyaltyService {
  constructor(
    @InjectModel(GuestLoyaltyAccount.name)
    private readonly accountModel: Model<GuestLoyaltyAccountDocument>,
    @InjectModel(GuestLoyaltyTransaction.name)
    private readonly transactionModel: Model<GuestLoyaltyTransaction>,
    @InjectModel(GuestVoucher.name)
    private readonly voucherModel: Model<GuestVoucherDocument>,
    @InjectModel(GuestProfile.name)
    private readonly guestModel: Model<GuestProfileDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async listAccounts(actor: AuthenticatedUser, locationId?: string) {
    const guestQuery = await this.scopedGuestQuery(actor, locationId);
    const guests = await this.guestModel
      .find(guestQuery)
      .sort({ updatedAt: -1 })
      .lean();
    const guestIds = guests.map((guest) => String(guest._id));

    await this.syncPaidOrders(actor, guestIds);
    await Promise.all(guestIds.map((guestId) => this.ensureAccountForGuestId(guestId)));

    const accounts = await this.accountModel
      .find({ tenantId: actor.tenantId, guestProfileId: { $in: guestIds } })
      .lean();
    const guestsById = new Map(guests.map((guest) => [String(guest._id), guest]));

    return accounts.map((account) => ({
      ...account,
      guest: guestsById.get(account.guestProfileId),
    }));
  }

  async getAccount(guestId: string, actor: AuthenticatedUser) {
    const guest = await this.getGuestOrThrow(guestId, actor);
    await this.syncPaidOrders(actor, [guestId]);
    const account = await this.ensureAccountForGuestId(guestId);
    const [transactions, vouchers] = await Promise.all([
      this.transactionModel
        .find({ tenantId: guest.tenantId, guestProfileId: guestId })
        .sort({ createdAt: -1 })
        .lean(),
      this.voucherModel
        .find({ tenantId: guest.tenantId, guestProfileId: guestId })
        .sort({ expiresAt: 1 })
        .lean(),
    ]);

    return { account, transactions, vouchers };
  }

  async listVouchers(actor: AuthenticatedUser, locationId?: string) {
    const query = await this.scopedVoucherQuery(actor, locationId);
    await this.expireOverdueVouchers(query);
    return this.voucherModel.find(query).sort({ expiresAt: 1 }).lean();
  }

  async createVoucher(payload: CreateGuestVoucherDto, actor: AuthenticatedUser) {
    this.assertTenant(actor);
    if (payload.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, payload.locationId);
    }
    if (payload.guestProfileId) {
      await this.getGuestOrThrow(payload.guestProfileId, actor);
    }

    return this.voucherModel.create({
      ...payload,
      code: this.normalizeCode(payload.code),
      tenantId: actor.tenantId,
      expiresAt: new Date(payload.expiresAt),
      status: GuestVoucherStatus.Active,
    });
  }

  async updateVoucher(
    id: string,
    payload: UpdateGuestVoucherDto,
    actor: AuthenticatedUser,
  ) {
    const voucher = await this.getVoucherOrThrow(id, actor);
    if (payload.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, payload.locationId);
    }
    if (payload.guestProfileId) {
      await this.getGuestOrThrow(payload.guestProfileId, actor);
    }

    const updated = await this.voucherModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          code: payload.code ? this.normalizeCode(payload.code) : voucher.code,
          expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Gutschein nicht gefunden');
    }

    return updated;
  }

  async redeemVoucher(
    id: string,
    payload: RedeemGuestVoucherDto,
    actor: AuthenticatedUser,
  ) {
    const voucher = await this.getVoucherOrThrow(id, actor);
    if (voucher.status !== GuestVoucherStatus.Active) {
      throw new BadRequestException('Gutschein ist nicht aktiv');
    }
    if (voucher.expiresAt < new Date()) {
      voucher.status = GuestVoucherStatus.Expired;
      await voucher.save();
      throw new BadRequestException('Gutschein ist abgelaufen');
    }
    if (payload.guestProfileId) {
      await this.getGuestOrThrow(payload.guestProfileId, actor);
    }

    voucher.status = GuestVoucherStatus.Redeemed;
    voucher.redeemedAt = new Date();
    voucher.redeemedByUserId = actor.sub;
    voucher.guestProfileId = payload.guestProfileId ?? voucher.guestProfileId;
    voucher.note = payload.note ?? voucher.note;
    return voucher.save();
  }

  async cancelVoucher(id: string, actor: AuthenticatedUser) {
    const voucher = await this.getVoucherOrThrow(id, actor);
    voucher.status = GuestVoucherStatus.Cancelled;
    return voucher.save();
  }

  async birthdays(actor: AuthenticatedUser) {
    const guestQuery = await this.scopedGuestQuery(actor);
    const guests = await this.guestModel.find(guestQuery).lean();
    const now = new Date();

    return {
      today: guests.filter((guest) => this.hasBirthdayInRange(guest.birthday, now, 0)).length,
      thisWeek: guests.filter((guest) => this.hasBirthdayInRange(guest.birthday, now, 7)).length,
      thisMonth: guests.filter((guest) => this.hasBirthdayThisMonth(guest.birthday, now)).length,
    };
  }

  private async syncPaidOrders(
    actor: AuthenticatedUser,
    guestIds?: string[],
  ): Promise<void> {
    this.assertTenant(actor);
    const scope = await this.accessPolicy.getScopedResourceFilter(actor);
    const orderQuery: Record<string, unknown> = {
      tenantId: actor.tenantId,
      ...scope,
      status: { $ne: OrderStatus.Cancelled },
      paymentStatus: PaymentStatus.Paid,
      guestProfileId: { $exists: true, $ne: '' },
    };

    if (guestIds?.length) {
      orderQuery.guestProfileId = { $in: guestIds };
    }

    const orders = await this.orderModel.find(orderQuery).lean();
    for (const order of orders) {
      const guestProfileId = order.guestProfileId;
      if (!guestProfileId) continue;
      const revenue = this.orderRevenue(order);
      const points = Math.floor(revenue * POINTS_PER_EURO);
      if (points <= 0) continue;

      const exists = await this.transactionModel.exists({
        tenantId: actor.tenantId,
        guestProfileId,
        orderId: String(order._id),
        type: GuestLoyaltyTransactionType.Earned,
      });
      if (!exists) {
        await this.transactionModel.create({
          tenantId: actor.tenantId,
          guestProfileId,
          type: GuestLoyaltyTransactionType.Earned,
          points,
          orderId: String(order._id),
          note: 'POS Umsatz',
        });
      }
    }

    const affectedGuestIds = guestIds?.length
      ? guestIds
      : [...new Set(orders.map((order) => order.guestProfileId).filter(Boolean))] as string[];
    await Promise.all(affectedGuestIds.map((guestId) => this.recalculateAccount(actor.tenantId!, guestId)));
  }

  private async ensureAccountForGuestId(guestProfileId: string) {
    const guest = await this.guestModel.findById(guestProfileId).lean();
    if (!guest) {
      throw new NotFoundException('Gastprofil nicht gefunden');
    }

    let account = await this.accountModel.findOne({
      tenantId: guest.tenantId,
      guestProfileId,
    }).exec();

    if (!account) {
      account = await this.accountModel.create({
        tenantId: guest.tenantId,
        guestProfileId,
        pointsBalance: 0,
        lifetimePoints: 0,
        lifetimeRevenue: 0,
        totalVisits: 0,
        tier: GuestLoyaltyTier.Bronze,
      });
    }

    return this.recalculateAccount(guest.tenantId, guestProfileId);
  }

  private async recalculateAccount(tenantId: string, guestProfileId: string) {
    const [transactions, revenueAgg] = await Promise.all([
      this.transactionModel.find({ tenantId, guestProfileId }).lean(),
      this.orderModel.aggregate<{ revenue: number; visits: number }>([
        {
          $match: {
            tenantId,
            guestProfileId,
            status: { $ne: OrderStatus.Cancelled },
            paymentStatus: PaymentStatus.Paid,
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$total' },
            visits: { $sum: 1 },
          },
        },
      ]),
    ]);
    const lifetimePoints = transactions
      .filter((entry) => entry.type === GuestLoyaltyTransactionType.Earned)
      .reduce((sum, entry) => sum + Number(entry.points ?? 0), 0);
    const redeemed = transactions
      .filter((entry) => entry.type === GuestLoyaltyTransactionType.Redeemed)
      .reduce((sum, entry) => sum + Math.abs(Number(entry.points ?? 0)), 0);
    const adjustments = transactions
      .filter((entry) => entry.type === GuestLoyaltyTransactionType.Adjustment)
      .reduce((sum, entry) => sum + Number(entry.points ?? 0), 0);
    const pointsBalance = Math.max(0, lifetimePoints + adjustments - redeemed);
    const lifetimeRevenue = Number(revenueAgg[0]?.revenue ?? 0);
    const totalVisits = Number(revenueAgg[0]?.visits ?? 0);
    const tier = this.resolveTier(lifetimePoints);

    return this.accountModel
      .findOneAndUpdate(
        { tenantId, guestProfileId },
        { pointsBalance, lifetimePoints, lifetimeRevenue, totalVisits, tier },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      )
      .lean();
  }

  private async getGuestOrThrow(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<GuestProfileDocument> {
    this.validateObjectId(id, 'Gast-ID');
    const guest = await this.guestModel.findById(id).exec();
    if (
      !guest ||
      !actor.tenantId ||
      guest.tenantId !== actor.tenantId ||
      !(await this.canAccessLocation(actor, guest.locationId))
    ) {
      throw new NotFoundException('Gastprofil nicht gefunden');
    }
    return guest;
  }

  private async getVoucherOrThrow(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<GuestVoucherDocument> {
    this.validateObjectId(id, 'Gutschein-ID');
    const voucher = await this.voucherModel.findById(id).exec();
    if (
      !voucher ||
      !actor.tenantId ||
      voucher.tenantId !== actor.tenantId ||
      !(await this.canAccessLocation(actor, voucher.locationId))
    ) {
      throw new NotFoundException('Gutschein nicht gefunden');
    }
    return voucher;
  }

  private async scopedGuestQuery(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<Record<string, unknown>> {
    this.assertTenant(actor);
    const query: Record<string, unknown> = {
      tenantId: actor.tenantId,
      active: true,
    };
    if (locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, locationId);
      query.$or = [{ locationId }, { locationId: { $exists: false } }];
      return query;
    }
    const scoped = await this.accessPolicy.getScopedResourceFilter(actor);
    if (scoped.locationId) {
      query.$or = [{ locationId: scoped.locationId }, { locationId: { $exists: false } }];
    }
    return query;
  }

  private async scopedVoucherQuery(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<Record<string, unknown>> {
    this.assertTenant(actor);
    const query: Record<string, unknown> = { tenantId: actor.tenantId };
    if (locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, locationId);
      query.$or = [{ locationId }, { locationId: { $exists: false } }];
      return query;
    }
    const scoped = await this.accessPolicy.getScopedResourceFilter(actor);
    if (scoped.locationId) {
      query.$or = [{ locationId: scoped.locationId }, { locationId: { $exists: false } }];
    }
    return query;
  }

  private async canAccessLocation(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<boolean> {
    return !locationId || this.accessPolicy.canAccessLocation(actor, locationId);
  }

  private async expireOverdueVouchers(query: Record<string, unknown>) {
    await this.voucherModel.updateMany(
      {
        ...query,
        status: GuestVoucherStatus.Active,
        expiresAt: { $lt: new Date() },
      },
      { status: GuestVoucherStatus.Expired },
    );
  }

  private hasBirthdayInRange(
    birthday: Date | string | undefined,
    from: Date,
    days: number,
  ): boolean {
    if (!birthday) return false;
    const current = new Date(from);
    for (let index = 0; index <= days; index += 1) {
      if (this.sameMonthDay(birthday, current)) return true;
      current.setDate(current.getDate() + 1);
    }
    return false;
  }

  private hasBirthdayThisMonth(
    birthday: Date | string | undefined,
    now: Date,
  ): boolean {
    return Boolean(birthday && new Date(birthday).getMonth() === now.getMonth());
  }

  private sameMonthDay(value: Date | string, date: Date): boolean {
    const birthday = new Date(value);
    return birthday.getMonth() === date.getMonth() && birthday.getDate() === date.getDate();
  }

  private orderRevenue(order: Pick<Order, 'total' | 'refundTotal'>): number {
    return Math.max(0, Number(order.total ?? 0) - Number(order.refundTotal ?? 0));
  }

  private resolveTier(points: number): GuestLoyaltyTier {
    return TIER_THRESHOLDS.find((entry) => points >= entry.points)?.tier ?? GuestLoyaltyTier.Bronze;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private assertTenant(actor: AuthenticatedUser): void {
    if (!actor.tenantId) {
      throw new BadRequestException('Kein Tenant-Kontext fuer Loyalty');
    }
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
