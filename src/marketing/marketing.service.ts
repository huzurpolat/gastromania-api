import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  CampaignMessage,
  CampaignMessageDocument,
  CampaignMessageStatus,
} from '../communication/schemas/campaign-message.schema';
import {
  CommunicationChannel,
  CommunicationProvider,
  CommunicationProviderKey,
} from '../communication/schemas/communication-provider.schema';
import {
  GuestProfile,
  GuestProfileDocument,
} from '../guests/schemas/guest-profile.schema';
import {
  GuestLoyaltyAccount,
  GuestLoyaltyTier,
} from '../loyalty/schemas/guest-loyalty-account.schema';
import {
  GuestVoucher,
  GuestVoucherDocument,
} from '../loyalty/schemas/guest-voucher.schema';
import { Order, OrderStatus, PaymentStatus } from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/schemas/reservation.schema';
import {
  WaitlistEntry,
  WaitlistStatus,
} from '../waitlist/schemas/waitlist-entry.schema';
import {
  CreateMarketingCampaignDto,
  UpdateMarketingCampaignDto,
} from './dto/marketing-campaign.dto';
import {
  PrepareCampaignDeliveryDto,
  SendCampaignTestDto,
} from './dto/campaign-delivery.dto';
import {
  MarketingCampaign,
  MarketingCampaignDocument,
  MarketingCampaignStatus,
  MarketingDeliveryStatus,
} from './schemas/marketing-campaign.schema';
import {
  MarketingSegment,
  MarketingSegmentDocument,
  MarketingSegmentRule,
} from './schemas/marketing-segment.schema';

export interface MarketingSegmentDefinition {
  id: string;
  name: string;
  description: string;
  rules: MarketingSegmentRule[];
}

interface GuestVisitMetrics {
  guestId: string;
  visits: number;
  noShows: number;
  lastVisit?: Date;
  lifetimeRevenue: number;
  tier?: GuestLoyaltyTier;
  birthday?: Date;
  voucherExpiringSoon?: boolean;
}

const REACTIVATION_DAYS = 90;
const HIGH_REVENUE_THRESHOLD = 1000;
const VOUCHER_EXPIRY_DAYS = 7;

const STANDARD_SEGMENTS: MarketingSegmentDefinition[] = [
  {
    id: 'new-guests',
    name: 'Neue Gaeste',
    description: 'Gaeste mit bis zu 3 Besuchen.',
    rules: [{ field: 'visits', operator: 'lte', value: 3 }],
  },
  {
    id: 'regular-guests',
    name: 'Stammgaeste',
    description: 'Gaeste mit mindestens 10 Besuchen.',
    rules: [{ field: 'visits', operator: 'gte', value: 10 }],
  },
  {
    id: 'vip-guests',
    name: 'VIP Gaeste',
    description: 'Loyalty Gaeste in Gold oder Platinum.',
    rules: [
      {
        field: 'tier',
        operator: 'in',
        value: [GuestLoyaltyTier.Gold, GuestLoyaltyTier.Platinum],
      },
    ],
  },
  {
    id: 'birthday-week',
    name: 'Geburtstag diese Woche',
    description: 'Gaeste mit Geburtstag in der aktuellen Kalenderwoche.',
    rules: [{ field: 'birthday', operator: 'thisWeek' }],
  },
  {
    id: 'reactivation-30',
    name: 'Reaktivierung 30 Tage',
    description: 'Kein Besuch seit 30 Tagen.',
    rules: [
      { field: 'lastVisit', operator: 'olderThanDays', value: 30 },
    ],
  },
  {
    id: 'reactivation-60',
    name: 'Reaktivierung 60 Tage',
    description: 'Kein Besuch seit 60 Tagen.',
    rules: [
      { field: 'lastVisit', operator: 'olderThanDays', value: 60 },
    ],
  },
  {
    id: 'reactivation-90',
    name: 'Reaktivierung 90 Tage',
    description: 'Kein Besuch seit 90 Tagen.',
    rules: [
      { field: 'lastVisit', operator: 'olderThanDays', value: 90 },
    ],
  },
  {
    id: 'reactivation',
    name: 'Reaktivierung',
    description: `Kein Besuch seit ${REACTIVATION_DAYS} Tagen.`,
    rules: [
      { field: 'lastVisit', operator: 'olderThanDays', value: REACTIVATION_DAYS },
    ],
  },
  {
    id: 'no-show-guests',
    name: 'No-Show Gaeste',
    description: 'Gaeste mit mindestens einem No-Show.',
    rules: [{ field: 'noShows', operator: 'gt', value: 0 }],
  },
  {
    id: 'loyalty-upgrade',
    name: 'Loyalty Upgrade',
    description: 'Gaeste mit Silver, Gold oder Platinum Status.',
    rules: [
      {
        field: 'tier',
        operator: 'in',
        value: [GuestLoyaltyTier.Silver, GuestLoyaltyTier.Gold, GuestLoyaltyTier.Platinum],
      },
    ],
  },
  {
    id: 'voucher-expiring',
    name: 'Gutschein laeuft bald ab',
    description: `Aktive Gutscheine mit Ablauf in ${VOUCHER_EXPIRY_DAYS} Tagen.`,
    rules: [{ field: 'voucherExpiringSoon', operator: 'eq', value: true }],
  },
  {
    id: 'high-revenue',
    name: 'Hoher Umsatz',
    description: `Gaeste mit mehr als ${HIGH_REVENUE_THRESHOLD} EUR Lifetime-Umsatz.`,
    rules: [
      { field: 'lifetimeRevenue', operator: 'gt', value: HIGH_REVENUE_THRESHOLD },
    ],
  },
];

@Injectable()
export class MarketingService {
  constructor(
    @InjectModel(MarketingCampaign.name)
    private readonly campaignModel: Model<MarketingCampaignDocument>,
    @InjectModel(MarketingSegment.name)
    private readonly segmentModel: Model<MarketingSegmentDocument>,
    @InjectModel(CampaignMessage.name)
    private readonly messageModel: Model<CampaignMessageDocument>,
    @InjectModel(CommunicationProvider.name)
    private readonly providerModel: Model<CommunicationProvider>,
    @InjectModel(GuestProfile.name)
    private readonly guestModel: Model<GuestProfileDocument>,
    @InjectModel(GuestLoyaltyAccount.name)
    private readonly loyaltyAccountModel: Model<GuestLoyaltyAccount>,
    @InjectModel(GuestVoucher.name)
    private readonly voucherModel: Model<GuestVoucherDocument>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<Reservation>,
    @InjectModel(WaitlistEntry.name)
    private readonly waitlistModel: Model<WaitlistEntry>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<Order>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async listCampaigns(actor: AuthenticatedUser) {
    this.assertTenant(actor);
    const campaigns = await this.campaignModel
      .find({ tenantId: actor.tenantId, active: { $ne: false } })
      .sort({ updatedAt: -1 })
      .lean();

    return Promise.all(
      campaigns.map(async (campaign) => ({
        ...campaign,
        analytics: await this.analyticsForCampaign(campaign, actor),
      })),
    );
  }

  async createCampaign(
    payload: CreateMarketingCampaignDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManageMarketing(actor);
    await this.resolveSegment(payload.targetSegmentId, actor);
    await this.assertVoucherAllowed(payload.voucherId, actor);

    return this.campaignModel.create({
      ...payload,
      tenantId: actor.tenantId,
      createdByUserId: actor.sub,
      status: payload.status ?? MarketingCampaignStatus.Draft,
      deliveryStatus: MarketingDeliveryStatus.NotPrepared,
      queuedCount: 0,
      sentCount: 0,
      failedCount: 0,
      scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
      active: true,
    });
  }

  async createCampaignFromAutomation(
    payload: CreateMarketingCampaignDto,
    actor: AuthenticatedUser,
  ) {
    return this.createCampaign(payload, actor);
  }

  async updateCampaign(
    id: string,
    payload: UpdateMarketingCampaignDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManageMarketing(actor);
    const campaign = await this.getCampaignOrThrow(id, actor);
    if (payload.targetSegmentId) {
      await this.resolveSegment(payload.targetSegmentId, actor);
    }
    if (payload.voucherId) {
      await this.assertVoucherAllowed(payload.voucherId, actor);
    }

    const update = {
      ...payload,
      scheduledAt: payload.scheduledAt
        ? new Date(payload.scheduledAt)
        : payload.scheduledAt,
    };

    const updated = await this.campaignModel
      .findByIdAndUpdate(campaign._id, update, {
        returnDocument: 'after',
        runValidators: true,
      })
      .exec();

    if (!updated) {
      throw new NotFoundException('Kampagne nicht gefunden');
    }

    return updated;
  }

  async archiveCampaign(id: string, actor: AuthenticatedUser) {
    this.assertCanManageMarketing(actor);
    const campaign = await this.getCampaignOrThrow(id, actor);
    campaign.status = MarketingCampaignStatus.Cancelled;
    campaign.active = false;
    return campaign.save();
  }

  async getCampaignMessages(id: string, actor: AuthenticatedUser) {
    await this.getCampaignOrThrow(id, actor);
    return this.messageModel
      .find({ tenantId: actor.tenantId, campaignId: id })
      .sort({ createdAt: -1 })
      .lean();
  }

  async prepareDelivery(
    id: string,
    payload: PrepareCampaignDeliveryDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManageMarketing(actor);
    const campaign = await this.getCampaignOrThrow(id, actor);
    const audience = await this.resolveAudience(campaign.targetSegmentId, actor);
    const provider = await this.findActiveProvider(actor, payload.channel);
    const existing = await this.messageModel
      .find({
        tenantId: actor.tenantId,
        campaignId: id,
        channel: payload.channel,
      })
      .select('guestProfileId channel')
      .lean();
    const existingKeys = new Set(
      existing.map((message) => `${message.guestProfileId}:${message.channel}`),
    );

    const messages = audience
      .map((guest) => this.messageForGuest(campaign, guest, payload.channel, provider?.provider))
      .filter((message): message is Omit<CampaignMessage, 'tenantId'> => Boolean(message))
      .filter((message) => !existingKeys.has(`${message.guestProfileId}:${message.channel}`))
      .map((message) => ({
        ...message,
        tenantId: actor.tenantId!,
        campaignId: id,
        status: CampaignMessageStatus.Queued,
      }));

    if (messages.length) {
      await this.messageModel.insertMany(messages);
    }

    return this.recalculateDeliveryStats(id, actor);
  }

  async sendTest(
    id: string,
    payload: SendCampaignTestDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManageMarketing(actor);
    const campaign = await this.getCampaignOrThrow(id, actor);
    const provider = await this.findActiveProvider(actor, payload.channel);
    const recipient = payload.email || payload.recipient;
    const baseMessage = await this.messageModel.create({
      tenantId: actor.tenantId,
      campaignId: id,
      guestProfileId: 'test-message',
      channel: payload.channel,
      recipient,
      subject: payload.channel === CommunicationChannel.Email ? campaign.subject : undefined,
      body: campaign.message,
      provider: provider?.provider,
      status: CampaignMessageStatus.Draft,
    });

    const result = await this.trySendMessage(baseMessage, provider);
    baseMessage.status = result.ok
      ? CampaignMessageStatus.Sent
      : CampaignMessageStatus.Failed;
    baseMessage.error = result.ok ? undefined : result.error;
    baseMessage.providerMessageId = result.providerMessageId;
    baseMessage.sentAt = result.ok ? new Date() : undefined;
    await baseMessage.save();

    await this.recalculateDeliveryStats(id, actor);
    return baseMessage;
  }

  async sendCampaign(id: string, actor: AuthenticatedUser) {
    this.assertCanManageMarketing(actor);
    await this.getCampaignOrThrow(id, actor);
    const queued = await this.messageModel.find({
      tenantId: actor.tenantId,
      campaignId: id,
      status: CampaignMessageStatus.Queued,
    });

    for (const message of queued) {
      const provider = await this.findActiveProvider(actor, message.channel);
      const result = await this.trySendMessage(message, provider);
      message.status = result.ok
        ? CampaignMessageStatus.Sent
        : CampaignMessageStatus.Failed;
      message.error = result.ok ? undefined : result.error;
      message.providerMessageId = result.providerMessageId;
      message.sentAt = result.ok ? new Date() : undefined;
      await message.save();
    }

    return this.recalculateDeliveryStats(id, actor);
  }

  async listSegments(actor: AuthenticatedUser) {
    this.assertTenant(actor);
    const persisted = await this.segmentModel
      .find({ tenantId: actor.tenantId, active: true })
      .sort({ name: 1 })
      .lean();

    const standard = await Promise.all(
      STANDARD_SEGMENTS.map(async (segment) => ({
        ...segment,
        active: true,
        estimatedAudience: (await this.resolveAudience(segment.id, actor)).length,
        source: 'standard',
      })),
    );

    const custom = await Promise.all(
      persisted.map(async (segment) => ({
        id: String(segment._id),
        name: segment.name,
        description: 'Benutzerdefiniertes Segment',
        rules: segment.rules,
        active: segment.active,
        estimatedAudience: (await this.resolveCustomAudience(segment.rules, actor))
          .length,
        source: 'custom',
      })),
    );

    return [...standard, ...custom];
  }

  async previewSegment(id: string, actor: AuthenticatedUser) {
    const segment = await this.resolveSegment(id, actor);
    const audience = await this.resolveAudience(id, actor);

    return {
      segment,
      estimatedAudience: audience.length,
      recipients: audience.slice(0, 50).map((guest) => ({
        _id: String(guest._id),
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        phone: guest.phone,
        marketingConsent: guest.marketingConsent,
        newsletterConsent: guest.newsletterConsent,
      })),
    };
  }

  async guestMarketingHistory(guestId: string, actor: AuthenticatedUser) {
    this.assertTenant(actor);
    await this.ensureGuestAllowed(guestId, actor);
    const messages = await this.messageModel
      .find({ tenantId: actor.tenantId, guestProfileId: guestId })
      .sort({ createdAt: -1 })
      .lean();
    const campaignIds = [...new Set(messages.map((message) => message.campaignId))];
    const campaigns = await this.campaignModel
      .find({ tenantId: actor.tenantId, _id: { $in: campaignIds } })
      .select('name type status')
      .lean();
    const campaignsById = new Map(
      campaigns.map((campaign) => [String(campaign._id), campaign]),
    );

    return messages.map((message) => ({
      ...message,
      campaign: campaignsById.get(message.campaignId),
    }));
  }

  private async analyticsForCampaign(
    campaign: MarketingCampaign,
    actor: AuthenticatedUser,
  ) {
    const [segment, audience, voucher] = await Promise.all([
      this.resolveSegment(campaign.targetSegmentId, actor),
      this.resolveAudience(campaign.targetSegmentId, actor),
      campaign.voucherId
        ? this.voucherModel
            .findOne({ _id: campaign.voucherId, tenantId: actor.tenantId })
            .lean()
        : Promise.resolve(null),
    ]);

    return {
      audienceCount: audience.length,
      segmentName: segment.name,
      segmentType: campaign.targetSegmentId,
      voucherCode: voucher?.code,
      voucherValue: voucher?.value ?? 0,
      voucherType: voucher?.type,
    };
  }

  private messageForGuest(
    campaign: MarketingCampaign,
    guest: GuestProfile & { _id?: unknown },
    channel: CommunicationChannel,
    provider?: CommunicationProviderKey,
  ): Omit<CampaignMessage, 'tenantId'> | null {
    if (!guest.marketingConsent) {
      return null;
    }

    if (channel === CommunicationChannel.Email) {
      if (!guest.newsletterConsent || !guest.email) {
        return null;
      }
      return {
        campaignId: String((campaign as { _id?: unknown })._id),
        guestProfileId: String(guest._id),
        channel,
        recipient: guest.email,
        subject: campaign.subject,
        body: campaign.message,
        status: CampaignMessageStatus.Queued,
        provider,
      } as Omit<CampaignMessage, 'tenantId'>;
    }

    if (!guest.phone) {
      return null;
    }

    return {
      campaignId: String((campaign as { _id?: unknown })._id),
      guestProfileId: String(guest._id),
      channel,
      recipient: guest.phone,
      body: campaign.message,
      status: CampaignMessageStatus.Queued,
      provider,
    } as Omit<CampaignMessage, 'tenantId'>;
  }

  private async recalculateDeliveryStats(id: string, actor: AuthenticatedUser) {
    const messages = await this.messageModel
      .find({ tenantId: actor.tenantId, campaignId: id })
      .lean();
    const queuedCount = messages.filter(
      (message) => message.status === CampaignMessageStatus.Queued,
    ).length;
    const sentCount = messages.filter(
      (message) => message.status === CampaignMessageStatus.Sent,
    ).length;
    const failedCount = messages.filter(
      (message) => message.status === CampaignMessageStatus.Failed,
    ).length;
    const deliveryStatus = this.resolveDeliveryStatus(
      queuedCount,
      sentCount,
      failedCount,
      messages.length,
    );

    const updated = await this.campaignModel
      .findByIdAndUpdate(
        id,
        { queuedCount, sentCount, failedCount, deliveryStatus },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Kampagne nicht gefunden');
    }

    return updated;
  }

  private resolveDeliveryStatus(
    queuedCount: number,
    sentCount: number,
    failedCount: number,
    total: number,
  ) {
    if (total === 0) return MarketingDeliveryStatus.NotPrepared;
    if (sentCount > 0 && failedCount === 0 && queuedCount === 0) {
      return MarketingDeliveryStatus.Sent;
    }
    if (failedCount > 0 && sentCount === 0 && queuedCount === 0) {
      return MarketingDeliveryStatus.Failed;
    }
    if (failedCount > 0 && sentCount > 0) {
      return MarketingDeliveryStatus.PartialFailed;
    }
    if (queuedCount > 0) {
      return MarketingDeliveryStatus.Queued;
    }
    return MarketingDeliveryStatus.NotPrepared;
  }

  private async findActiveProvider(
    actor: AuthenticatedUser,
    channel: CommunicationChannel,
  ) {
    return this.providerModel
      .findOne({
        tenantId: actor.tenantId,
        type: channel,
        active: true,
      })
      .sort({ updatedAt: -1 })
      .lean();
  }

  private async trySendMessage(
    message: CampaignMessageDocument,
    provider: CommunicationProvider | null,
  ): Promise<{ ok: boolean; error?: string; providerMessageId?: string }> {
    if (!provider) {
      return {
        ok: false,
        error: 'Kein aktiver Communication Provider konfiguriert',
      };
    }

    const endpointUrl = String(provider.config?.endpointUrl ?? '');
    const secretEnvVar = String(provider.config?.secretEnvVar ?? '');
    const secret = secretEnvVar ? process.env[secretEnvVar] : '';
    if (!endpointUrl || !secret) {
      return {
        ok: false,
        error:
          'Provider ist angelegt, aber ohne Endpoint oder Secret-Umgebungsvariable nicht versandbereit',
      };
    }

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          provider: provider.provider,
          channel: message.channel,
          recipient: message.recipient,
          subject: message.subject,
          body: message.body,
        }),
      });

      if (!response.ok) {
        return { ok: false, error: `Provider antwortete mit ${response.status}` };
      }
      const data = (await response.json().catch(() => ({}))) as {
        id?: string;
        messageId?: string;
      };
      return { ok: true, providerMessageId: data.messageId ?? data.id };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Provider-Versand fehlgeschlagen',
      };
    }
  }

  private async resolveSegment(id: string, actor: AuthenticatedUser) {
    this.assertTenant(actor);
    const standard = STANDARD_SEGMENTS.find((segment) => segment.id === id);
    if (standard) {
      return { ...standard, active: true, source: 'standard' };
    }

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltiges Segment');
    }

    const segment = await this.segmentModel
      .findOne({ _id: id, tenantId: actor.tenantId, active: true })
      .lean();
    if (!segment) {
      throw new NotFoundException('Segment nicht gefunden');
    }

    return {
      id: String(segment._id),
      name: segment.name,
      description: 'Benutzerdefiniertes Segment',
      rules: segment.rules,
      active: segment.active,
      source: 'custom',
    };
  }

  private async resolveAudience(id: string, actor: AuthenticatedUser) {
    const standard = STANDARD_SEGMENTS.find((segment) => segment.id === id);
    if (standard) {
      const metrics = await this.loadGuestMetrics(actor);
      return metrics.guests.filter((guest) =>
        this.matchesRules(metrics.byGuestId.get(String(guest._id)), standard.rules),
      );
    }

    const segment = await this.segmentModel
      .findOne({ _id: id, tenantId: actor.tenantId, active: true })
      .lean();
    if (!segment) {
      return [];
    }
    return this.resolveCustomAudience(segment.rules, actor);
  }

  private async resolveCustomAudience(
    rules: MarketingSegmentRule[],
    actor: AuthenticatedUser,
  ) {
    const metrics = await this.loadGuestMetrics(actor);
    return metrics.guests.filter((guest) =>
      this.matchesRules(metrics.byGuestId.get(String(guest._id)), rules),
    );
  }

  private async loadGuestMetrics(actor: AuthenticatedUser) {
    const guestQuery = await this.scopedGuestQuery(actor);
    const guests = await this.guestModel.find(guestQuery).lean();
    const guestIds = guests.map((guest) => String(guest._id));
    const [
      reservations,
      waitlist,
      accounts,
      orderRows,
      expiringVouchers,
    ] = await Promise.all([
      this.reservationModel
        .find({ tenantId: actor.tenantId, guestProfileId: { $in: guestIds } })
        .lean(),
      this.waitlistModel
        .find({ tenantId: actor.tenantId, guestProfileId: { $in: guestIds } })
        .lean(),
      this.loyaltyAccountModel
        .find({ tenantId: actor.tenantId, guestProfileId: { $in: guestIds } })
        .lean(),
      this.orderModel
        .find({
          tenantId: actor.tenantId,
          guestProfileId: { $in: guestIds },
          paymentStatus: PaymentStatus.Paid,
          status: { $ne: OrderStatus.Cancelled },
        })
        .lean(),
      this.voucherModel
        .find({
          tenantId: actor.tenantId,
          guestProfileId: { $in: guestIds },
          status: 'ACTIVE',
          expiresAt: {
            $gte: new Date(),
            $lte: this.addDays(new Date(), VOUCHER_EXPIRY_DAYS),
          },
        })
        .lean(),
    ]);

    const byGuestId = new Map<string, GuestVisitMetrics>();
    for (const guest of guests) {
      byGuestId.set(String(guest._id), {
        guestId: String(guest._id),
        visits: 0,
        noShows: 0,
        lifetimeRevenue: 0,
        birthday: guest.birthday ? new Date(guest.birthday) : undefined,
      });
    }

    for (const account of accounts) {
      const metrics = byGuestId.get(account.guestProfileId);
      if (!metrics) continue;
      metrics.tier = account.tier;
      metrics.lifetimeRevenue = Math.max(
        metrics.lifetimeRevenue,
        account.lifetimeRevenue ?? 0,
      );
      metrics.visits = Math.max(metrics.visits, account.totalVisits ?? 0);
    }

    for (const voucher of expiringVouchers) {
      const metrics = voucher.guestProfileId
        ? byGuestId.get(voucher.guestProfileId)
        : undefined;
      if (metrics) {
        metrics.voucherExpiringSoon = true;
      }
    }

    for (const order of orderRows) {
      const guestId = order.guestProfileId;
      const metrics = guestId ? byGuestId.get(guestId) : undefined;
      if (!metrics) continue;
      metrics.lifetimeRevenue += Number(order.total ?? 0);
      metrics.lastVisit = this.maxDate(
        metrics.lastVisit,
        (order as { createdAt?: Date }).createdAt,
      );
    }

    for (const reservation of reservations) {
      const metrics = reservation.guestProfileId
        ? byGuestId.get(reservation.guestProfileId)
        : undefined;
      if (!metrics) continue;
      if (
        [ReservationStatus.CheckedIn, ReservationStatus.Completed].includes(
          reservation.status as ReservationStatus,
        )
      ) {
        metrics.visits += 1;
        metrics.lastVisit = this.maxDate(metrics.lastVisit, reservation.startTime);
      }
      if (reservation.status === ReservationStatus.NoShow) {
        metrics.noShows += 1;
      }
    }

    for (const entry of waitlist) {
      const metrics = entry.guestProfileId
        ? byGuestId.get(entry.guestProfileId)
        : undefined;
      if (!metrics) continue;
      if (entry.status === WaitlistStatus.Seated) {
        metrics.visits += 1;
        metrics.lastVisit = this.maxDate(
          metrics.lastVisit,
          (entry as { createdAt?: Date }).createdAt,
        );
      }
      if (entry.status === WaitlistStatus.NoShow) {
        metrics.noShows += 1;
      }
    }

    return { guests, byGuestId };
  }

  private matchesRules(
    metrics: GuestVisitMetrics | undefined,
    rules: MarketingSegmentRule[],
  ) {
    if (!metrics) {
      return false;
    }

    return rules.every((rule) => {
      const value = this.metricValue(metrics, rule.field);
      switch (rule.operator) {
        case 'lte':
          return Number(value ?? 0) <= Number(rule.value ?? 0);
        case 'gte':
          return Number(value ?? 0) >= Number(rule.value ?? 0);
        case 'gt':
          return Number(value ?? 0) > Number(rule.value ?? 0);
        case 'eq':
          return value === rule.value;
        case 'in':
          return Array.isArray(rule.value) && rule.value.includes(value);
        case 'olderThanDays':
          return this.isOlderThanDays(value as Date | undefined, Number(rule.value));
        case 'thisWeek':
          return this.isBirthdayThisWeek(value as Date | undefined);
        default:
          return false;
      }
    });
  }

  private metricValue(metrics: GuestVisitMetrics, field: string) {
    return metrics[field as keyof GuestVisitMetrics];
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private async scopedGuestQuery(actor: AuthenticatedUser) {
    this.assertTenant(actor);
    const scope = await this.accessPolicy.getScopedResourceFilter(actor);
    return { tenantId: actor.tenantId, ...scope, active: true };
  }

  private async ensureGuestAllowed(guestId: string, actor: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(guestId)) {
      throw new NotFoundException('Gastprofil nicht gefunden');
    }
    const query = await this.scopedGuestQuery(actor);
    const guest = await this.guestModel.findOne({ ...query, _id: guestId }).lean();
    if (!guest) {
      throw new NotFoundException('Gastprofil nicht gefunden');
    }
  }

  private async assertVoucherAllowed(
    voucherId: string | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!voucherId) return;
    const voucher = await this.voucherModel.findOne({
      _id: voucherId,
      tenantId: actor.tenantId,
    });
    if (!voucher) {
      throw new NotFoundException('Gutschein nicht gefunden');
    }
    if (
      voucher.locationId &&
      !(await this.accessPolicy.canAccessLocation(actor, voucher.locationId))
    ) {
      throw new ForbiddenException('Gutschein gehoert zu anderem Standort');
    }
  }

  private async getCampaignOrThrow(id: string, actor: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Kampagne nicht gefunden');
    }
    const campaign = await this.campaignModel.findOne({
      _id: id,
      tenantId: actor.tenantId,
    });
    if (!campaign) {
      throw new NotFoundException('Kampagne nicht gefunden');
    }
    return campaign;
  }

  private assertTenant(actor: AuthenticatedUser) {
    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext fuer Marketing');
    }
  }

  private assertCanManageMarketing(actor: AuthenticatedUser) {
    this.assertTenant(actor);
    if (!this.accessPolicy.isCompanyAdmin(actor)) {
      throw new ForbiddenException('Nur Tenant Admin darf Kampagnen bearbeiten');
    }
  }

  private isOlderThanDays(value: Date | undefined, days: number) {
    if (!value) {
      return true;
    }
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);
    return value < threshold;
  }

  private isBirthdayThisWeek(value: Date | undefined) {
    if (!value) return false;
    const now = new Date();
    const start = this.startOfWeek(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const cursor = new Date(start);
    while (cursor <= end) {
      if (cursor.getMonth() === value.getMonth() && cursor.getDate() === value.getDate()) {
        return true;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return false;
  }

  private startOfWeek(date: Date) {
    const start = new Date(date);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private maxDate(current: Date | undefined, candidate: Date | string | undefined) {
    if (!candidate) return current;
    const next = new Date(candidate);
    return !current || next > current ? next : current;
  }
}
