import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Order,
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import {
  GuestLoyaltyAccount,
  GuestLoyaltyTier,
} from '../loyalty/schemas/guest-loyalty-account.schema';
import {
  GuestVoucher,
  GuestVoucherStatus,
} from '../loyalty/schemas/guest-voucher.schema';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/schemas/reservation.schema';
import {
  WaitlistEntry,
  WaitlistStatus,
} from '../waitlist/schemas/waitlist-entry.schema';
import { CreateGuestProfileDto } from './dto/create-guest-profile.dto';
import { UpdateGuestProfileDto } from './dto/update-guest-profile.dto';
import {
  GuestProfile,
  GuestProfileDocument,
} from './schemas/guest-profile.schema';

export interface GuestContactInput {
  tenantId?: string;
  locationId?: string;
  name: string;
  phone?: string;
  email?: string;
  note?: string;
  preferredTableId?: string;
}

export interface GuestFilters {
  locationId?: string;
  search?: string;
}

@Injectable()
export class GuestsService {
  constructor(
    @InjectModel(GuestProfile.name)
    private readonly guestModel: Model<GuestProfileDocument>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<Reservation>,
    @InjectModel(WaitlistEntry.name)
    private readonly waitlistModel: Model<WaitlistEntry>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    @InjectModel(GuestLoyaltyAccount.name)
    private readonly loyaltyAccountModel: Model<GuestLoyaltyAccount>,
    @InjectModel(GuestVoucher.name)
    private readonly voucherModel: Model<GuestVoucher>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async findOrCreateFromContact(
    input: GuestContactInput,
    actor: AuthenticatedUser,
  ): Promise<GuestProfileDocument | null> {
    const tenantId = input.tenantId ?? actor.tenantId;
    if (!tenantId || !input.name?.trim()) {
      return null;
    }

    if (input.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, input.locationId);
    }

    const email = this.normalizeEmail(input.email);
    const phone = this.normalizePhone(input.phone);
    const name = this.splitName(input.name);
    const existing = await this.findExistingGuest(tenantId, name, email, phone);

    if (existing) {
      let changed = false;
      if (!existing.email && email) {
        existing.email = email;
        changed = true;
      }
      if (!existing.phone && phone) {
        existing.phone = phone;
        changed = true;
      }
      if (!existing.locationId && input.locationId) {
        existing.locationId = input.locationId;
        changed = true;
      }
      if (!existing.preferredTableId && input.preferredTableId) {
        existing.preferredTableId = input.preferredTableId;
        changed = true;
      }
      if (!existing.notes && input.note) {
        existing.notes = input.note;
        changed = true;
      }
      return changed ? existing.save() : existing;
    }

    return this.guestModel.create({
      tenantId,
      locationId: input.locationId,
      firstName: name.firstName,
      lastName: name.lastName,
      phone,
      email,
      notes: input.note,
      preferredTableId: input.preferredTableId,
      marketingConsent: false,
      active: true,
    });
  }

  async findAll(actor: AuthenticatedUser, filters: GuestFilters = {}) {
    const query = await this.scopedGuestFilter(actor, filters.locationId);

    if (filters.search?.trim()) {
      const pattern = new RegExp(this.escapeRegExp(filters.search.trim()), 'i');
      query.$or = [
        { firstName: pattern },
        { lastName: pattern },
        { phone: pattern },
        { email: pattern },
      ];
    }

    const guests = await this.guestModel
      .find(query)
      .sort({ updatedAt: -1 })
      .lean();

    return Promise.all(
      guests.map(async (guest) => ({
        ...guest,
        analytics: await this.analyticsForGuest(String(guest._id), guest),
      })),
    );
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const guest = await this.getGuestOrThrow(id, actor);
    return guest;
  }

  async create(payload: CreateGuestProfileDto, actor: AuthenticatedUser) {
    if (!actor.tenantId) {
      throw new BadRequestException('Kein Tenant-Kontext fuer Gastprofil');
    }

    if (payload.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, payload.locationId);
    }

    const existing = await this.findExistingGuest(
      actor.tenantId,
      {
        firstName: payload.firstName,
        lastName: payload.lastName,
      },
      this.normalizeEmail(payload.email),
      this.normalizePhone(payload.phone),
    );

    if (existing) {
      return existing;
    }

    return this.guestModel.create({
      ...payload,
      tenantId: actor.tenantId,
      email: this.normalizeEmail(payload.email),
      phone: this.normalizePhone(payload.phone),
      birthday: payload.birthday ? new Date(payload.birthday) : undefined,
      marketingConsent: payload.marketingConsent ?? false,
      active: true,
    });
  }

  async update(
    id: string,
    payload: UpdateGuestProfileDto,
    actor: AuthenticatedUser,
  ) {
    await this.getGuestOrThrow(id, actor);

    if (payload.locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, payload.locationId);
    }

    const updated = await this.guestModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          email:
            payload.email === undefined
              ? undefined
              : this.normalizeEmail(payload.email),
          phone:
            payload.phone === undefined
              ? undefined
              : this.normalizePhone(payload.phone),
          birthday: payload.birthday ? new Date(payload.birthday) : undefined,
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Gastprofil nicht gefunden');
    }

    return updated;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    await this.getGuestOrThrow(id, actor);
    const updated = await this.guestModel
      .findByIdAndUpdate(
        id,
        { active: false },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Gastprofil nicht gefunden');
    }

    return updated;
  }

  async history(id: string, actor: AuthenticatedUser) {
    const guest = await this.getGuestOrThrow(id, actor);
    const guestId = String(guest._id);
    const contactFilter = this.contactHistoryFilter(guestId, guest);
    const locationFilter = await this.scopedLocationMatch(actor);

    const [reservations, waitlist, orders] = await Promise.all([
      this.reservationModel
        .find({ ...locationFilter, ...contactFilter.reservations })
        .sort({ startTime: -1 })
        .lean(),
      this.waitlistModel
        .find({ ...locationFilter, ...contactFilter.waitlist })
        .sort({ createdAt: -1 })
        .lean(),
      this.orderModel
        .find({ ...locationFilter, ...contactFilter.orders })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    const timeline = [
      ...reservations.map((reservation) => ({
        type: 'reservation',
        date: reservation.startTime,
        title: `Reservierung ${reservation.guestName}`,
        status: reservation.status,
        amount: 0,
        source: reservation,
      })),
      ...waitlist.map((entry) => ({
        type: 'waitlist',
        date: this.createdAt(entry),
        title: `Warteliste ${entry.guestName}`,
        status: entry.status,
        amount: 0,
        source: entry,
      })),
      ...orders.map((order) => ({
        type: 'order',
        date: this.createdAt(order),
        title: order.orderNumber ?? 'Bestellung',
        status: order.status,
        amount: order.total ?? 0,
        source: order,
      })),
    ].sort(
      (first, second) =>
        new Date(second.date ?? 0).getTime() - new Date(first.date ?? 0).getTime(),
    );

    return { reservations, waitlist, orders, timeline };
  }

  async analytics(id: string, actor: AuthenticatedUser) {
    const guest = await this.getGuestOrThrow(id, actor);
    return this.analyticsForGuest(id, guest);
  }

  private async analyticsForGuest(
    guestId: string,
    guest: Pick<
      GuestProfile,
      'tenantId' | 'locationId' | 'firstName' | 'lastName' | 'email' | 'phone'
    >,
  ) {
    const contactFilter = this.contactHistoryFilter(guestId, guest);
    const paidOrderFilter = {
      tenantId: guest.tenantId,
      status: { $ne: OrderStatus.Cancelled },
      paymentStatus: PaymentStatus.Paid,
      ...contactFilter.orders,
    };

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [reservations, waitlist, revenueAgg, revenueYearAgg, topOrder, loyaltyAccount, voucherStats] = await Promise.all([
      this.reservationModel
        .find({ tenantId: guest.tenantId, ...contactFilter.reservations })
        .select('status startTime')
        .lean(),
      this.waitlistModel
        .find({ tenantId: guest.tenantId, ...contactFilter.waitlist })
        .select('status createdAt updatedAt')
        .lean(),
      this.orderModel.aggregate<{
        revenue: number;
        visits: number;
        highest: number;
      }>([
        { $match: paidOrderFilter },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$total' },
            visits: { $sum: 1 },
            highest: { $max: '$total' },
          },
        },
      ]),
      this.orderModel.aggregate<{
        revenue: number;
      }>([
        {
          $match: {
            ...paidOrderFilter,
            createdAt: { $gte: yearStart },
          },
        },
        { $group: { _id: null, revenue: { $sum: '$total' } } },
      ]),
      this.orderModel
        .findOne(paidOrderFilter)
        .sort({ total: -1 })
        .select('total createdAt')
        .lean(),
      this.loyaltyAccountModel
        .findOne({ tenantId: guest.tenantId, guestProfileId: guestId })
        .lean(),
      this.voucherModel.aggregate<{ _id: GuestVoucherStatus; count: number }>([
        {
          $match: {
            tenantId: guest.tenantId,
            guestProfileId: guestId,
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    const checkIns = reservations.filter(
      (reservation) => reservation.status === ReservationStatus.CheckedIn,
    ).length;
    const reservationNoShows = reservations.filter(
      (reservation) => reservation.status === ReservationStatus.NoShow,
    );
    const waitlistNoShows = waitlist.filter(
      (entry) => entry.status === WaitlistStatus.NoShow,
    );
    const visits =
      checkIns +
      reservations.filter(
        (reservation) => reservation.status === ReservationStatus.Completed,
      ).length +
      waitlist.filter((entry) => entry.status === WaitlistStatus.Seated).length +
      Number(revenueAgg[0]?.visits ?? 0);
    const noShows = reservationNoShows.length + waitlistNoShows.length;
    const lastReservationDate = reservations
      .map((reservation) => reservation.startTime)
      .filter(Boolean)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    const lastWaitlistDate = waitlist
      .map((entry) => this.updatedAt(entry) ?? this.createdAt(entry))
      .filter((value): value is Date | string => this.isDateValue(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
    const lastVisit = [lastReservationDate, lastWaitlistDate, this.createdAt(topOrder)]
      .filter((value): value is Date | string => this.isDateValue(value))
      .sort((a, b) => new Date(b as Date).getTime() - new Date(a as Date).getTime())[0];
    const revenue = Number(revenueAgg[0]?.revenue ?? 0);
    const loyaltyPoints =
      loyaltyAccount?.pointsBalance ?? Math.floor(revenue * 1);
    const lifetimePoints =
      loyaltyAccount?.lifetimePoints ?? Math.floor(revenue * 1);

    return {
      visits,
      checkIns,
      totalRevenue: revenue,
      revenueThisYear: Number(revenueYearAgg[0]?.revenue ?? 0),
      averageRevenuePerVisit: visits > 0 ? revenue / visits : 0,
      highestSingleVisit: Number(revenueAgg[0]?.highest ?? 0),
      visitsPerMonth: this.calculateVisitsPerMonth(visits, guest),
      noShows,
      noShowRate: visits + noShows > 0 ? (noShows / (visits + noShows)) * 100 : 0,
      lastNoShow:
        [...reservationNoShows, ...waitlistNoShows]
          .map((item) =>
            'startTime' in item
              ? item.startTime
              : this.updatedAt(item) ?? this.createdAt(item),
          )
          .filter((value): value is Date | string => this.isDateValue(value))
          .sort((a, b) => new Date(b as Date).getTime() - new Date(a as Date).getTime())[0] ??
        null,
      lastVisit: lastVisit ?? null,
      noShowBadge:
        noShows === 0 ? 'Zuverlaessig' : noShows <= 2 ? 'Beobachten' : 'Hohe No-Show-Quote',
      loyalty: {
        pointsBalance: loyaltyPoints,
        lifetimePoints,
        lifetimeRevenue: loyaltyAccount?.lifetimeRevenue ?? revenue,
        totalVisits: loyaltyAccount?.totalVisits ?? Number(revenueAgg[0]?.visits ?? 0),
        tier:
          loyaltyAccount?.tier ??
          this.resolveLoyaltyTier(lifetimePoints),
        openVouchers:
          voucherStats.find((entry) => entry._id === GuestVoucherStatus.Active)
            ?.count ?? 0,
        redeemedVouchers:
          voucherStats.find((entry) => entry._id === GuestVoucherStatus.Redeemed)
            ?.count ?? 0,
      },
    };
  }

  private async getGuestOrThrow(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<GuestProfileDocument> {
    this.validateObjectId(id, 'Gast-ID');
    const guest = await this.guestModel.findById(id).exec();

    if (
      !guest ||
      (actor.tenantId && guest.tenantId !== actor.tenantId) ||
      !(await this.canAccessGuestLocation(actor, guest.locationId))
    ) {
      throw new NotFoundException('Gastprofil nicht gefunden');
    }

    return guest;
  }

  private async scopedGuestFilter(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<Record<string, unknown>> {
    if (!actor.tenantId) {
      return { _id: { $in: [] } };
    }

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
    const locationScope = scoped.locationId;
    if (locationScope) {
      query.$or = [
        { locationId: locationScope },
        { locationId: { $exists: false } },
      ];
    }

    return query;
  }

  private async scopedLocationMatch(actor: AuthenticatedUser) {
    const query = await this.accessPolicy.getScopedResourceFilter(actor);
    if (actor.tenantId) {
      query.tenantId = actor.tenantId;
    }
    return query;
  }

  private async canAccessGuestLocation(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<boolean> {
    if (!locationId) {
      return Boolean(actor.tenantId);
    }

    return this.accessPolicy.canAccessLocation(actor, locationId);
  }

  private async findExistingGuest(
    tenantId: string,
    name: { firstName: string; lastName: string },
    email?: string,
    phone?: string,
  ): Promise<GuestProfileDocument | null> {
    if (email) {
      const byEmail = await this.guestModel
        .findOne({ tenantId, email, active: true })
        .exec();
      if (byEmail) return byEmail;
    }

    if (phone) {
      const byPhone = await this.guestModel
        .findOne({ tenantId, phone, active: true })
        .exec();
      if (byPhone) return byPhone;

      const byNamePhone = await this.guestModel
        .findOne({
          tenantId,
          firstName: name.firstName,
          lastName: name.lastName,
          phone,
          active: true,
        })
        .exec();
      if (byNamePhone) return byNamePhone;
    }

    return null;
  }

  private contactHistoryFilter(
    guestId: string,
    guest: Pick<
      GuestProfile,
      'firstName' | 'lastName' | 'email' | 'phone'
    >,
  ) {
    const fullName = `${guest.firstName} ${guest.lastName}`.trim();
    const email = this.normalizeEmail(guest.email);
    const phone = this.normalizePhone(guest.phone);
    const guestConditions: Record<string, unknown>[] = [
      { guestProfileId: guestId },
    ];
    const orderConditions: Record<string, unknown>[] = [
      { guestProfileId: guestId },
    ];

    if (email) {
      guestConditions.push({ email }, { guestEmail: email });
    }

    if (phone) {
      guestConditions.push({ phone }, { guestPhone: phone });
    }

    if (fullName) {
      guestConditions.push({ guestName: fullName });
      orderConditions.push({ customerName: fullName });
    }

    return {
      reservations: { $or: guestConditions },
      waitlist: { $or: guestConditions },
      orders: { $or: orderConditions },
    };
  }

  private splitName(name: string): { firstName: string; lastName: string } {
    const parts = name.trim().replace(/\s+/g, ' ').split(' ');
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '-' };
    }

    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts.at(-1) ?? '-',
    };
  }

  private normalizeEmail(value?: string): string | undefined {
    const normalized = value?.trim().toLowerCase();
    return normalized || undefined;
  }

  private normalizePhone(value?: string): string | undefined {
    const normalized = value?.replace(/[^\d+]/g, '').trim();
    return normalized || undefined;
  }

  private calculateVisitsPerMonth(
    visits: number,
    guest: Pick<GuestProfile, 'locationId'>,
  ): number {
    void guest;
    return Number((visits / 12).toFixed(2));
  }

  private resolveLoyaltyTier(points: number): GuestLoyaltyTier {
    if (points >= 5000) return GuestLoyaltyTier.Platinum;
    if (points >= 1500) return GuestLoyaltyTier.Gold;
    if (points >= 500) return GuestLoyaltyTier.Silver;
    return GuestLoyaltyTier.Bronze;
  }

  private createdAt(record?: unknown): Date | string | undefined {
    return this.timestamp(record, 'createdAt');
  }

  private updatedAt(record?: unknown): Date | string | undefined {
    return this.timestamp(record, 'updatedAt');
  }

  private timestamp(
    record: unknown,
    field: 'createdAt' | 'updatedAt',
  ): Date | string | undefined {
    if (!record || typeof record !== 'object' || !(field in record)) {
      return undefined;
    }

    const value = (record as Record<string, unknown>)[field];
    return this.isDateValue(value) ? value : undefined;
  }

  private isDateValue(value: unknown): value is Date | string {
    return value instanceof Date || typeof value === 'string';
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
