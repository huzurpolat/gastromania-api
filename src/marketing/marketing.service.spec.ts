import { ForbiddenException } from '@nestjs/common';
import {
  CampaignMessageStatus,
} from '../communication/schemas/campaign-message.schema';
import { CommunicationChannel } from '../communication/schemas/communication-provider.schema';
import { OrderStatus, PaymentStatus } from '../orders/schemas/order.schema';
import { ReservationStatus } from '../reservations/schemas/reservation.schema';
import { WaitlistStatus } from '../waitlist/schemas/waitlist-entry.schema';
import { MarketingService } from './marketing.service';
import {
  MarketingCampaignStatus,
  MarketingCampaignType,
} from './schemas/marketing-campaign.schema';

describe('MarketingService', () => {
  const guestId = '507f1f77bcf86cd799439011';
  const voucherId = '507f1f77bcf86cd799439022';
  const campaignId = '507f1f77bcf86cd799439033';
  const actor = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    roles: ['TenantAdmin'],
    permissions: ['reservations.view', 'reservations.create'],
  };

  function findLean<T>(value: T) {
    return {
      sort: jest.fn(() => ({
        lean: jest.fn(async () => value),
      })),
      select: jest.fn(() => ({
        lean: jest.fn(async () => value),
      })),
      lean: jest.fn(async () => value),
      exec: jest.fn(async () => value),
    };
  }

  function createService() {
    const campaignDoc = {
      _id: campaignId,
      tenantId: 'tenant-1',
      status: MarketingCampaignStatus.Draft,
      targetSegmentId: 'vip-guests',
      subject: 'Danke',
      message: 'VIP Nachricht',
      active: true,
      save: jest.fn(async function save(this: unknown) {
        return this;
      }),
    };
    const campaignModel = {
      find: jest.fn(() => findLean([])),
      findOne: jest.fn(async () => campaignDoc),
      create: jest.fn(async (payload) => ({ _id: campaignId, ...payload })),
      findByIdAndUpdate: jest.fn((_id, payload) => ({
        lean: jest.fn(async () => ({ _id: campaignId, ...campaignDoc, ...payload })),
        exec: jest.fn(async () => ({ _id: campaignId, ...payload })),
      })),
    };
    const segmentModel = {
      find: jest.fn(() => findLean([])),
      findOne: jest.fn(() => findLean(null)),
    };
    const guestModel = {
      find: jest.fn(() =>
        findLean([
          {
            _id: guestId,
            tenantId: 'tenant-1',
            firstName: 'Mia',
            lastName: 'Muster',
            active: true,
            birthday: new Date(),
            email: 'mia@example.test',
            phone: '+49170000000',
            marketingConsent: true,
            newsletterConsent: true,
          },
        ]),
      ),
    };
    const loyaltyAccountModel = {
      find: jest.fn(() =>
        findLean([
          {
            guestProfileId: guestId,
            tier: 'GOLD',
            lifetimeRevenue: 1200,
            totalVisits: 12,
          },
        ]),
      ),
    };
    const voucherModel = {
      find: jest.fn(() => findLean([])),
      findOne: jest.fn(async () => ({
          _id: voucherId,
          tenantId: 'tenant-1',
          code: 'VIP15',
          value: 15,
          type: 'PERCENT',
        })),
    };
    const createdMessages: unknown[] = [];
    const messageDoc = {
      _id: 'message-test',
      tenantId: 'tenant-1',
      campaignId,
      guestProfileId: 'test-message',
      channel: CommunicationChannel.Email,
      recipient: 'test@example.test',
      status: CampaignMessageStatus.Draft,
      save: jest.fn(async function save(this: unknown) {
        return this;
      }),
    };
    const messageModel = {
      find: jest.fn(() => findLean(createdMessages)),
      create: jest.fn(async (payload) => Object.assign(messageDoc, payload)),
      insertMany: jest.fn(async (payloads) => {
        createdMessages.push(...payloads);
        return payloads;
      }),
    };
    const providerModel = {
      findOne: jest.fn(() => ({
        sort: jest.fn(() => ({
          lean: jest.fn(async () => null),
        })),
      })),
    };
    const reservationModel = {
      find: jest.fn(() =>
        findLean([
          {
            guestProfileId: guestId,
            status: ReservationStatus.Completed,
            startTime: new Date(),
          },
        ]),
      ),
    };
    const waitlistModel = {
      find: jest.fn(() =>
        findLean([
          {
            guestProfileId: guestId,
            status: WaitlistStatus.NoShow,
            createdAt: new Date(),
          },
        ]),
      ),
    };
    const orderModel = {
      find: jest.fn(() =>
        findLean([
          {
            guestProfileId: guestId,
            paymentStatus: PaymentStatus.Paid,
            status: OrderStatus.Closed,
            total: 1200,
            createdAt: new Date(),
          },
        ]),
      ),
    };
    const accessPolicy = {
      isCompanyAdmin: jest.fn(() => true),
      getScopedResourceFilter: jest.fn(async () => ({})),
      canAccessLocation: jest.fn(async () => true),
    };

    const service = new MarketingService(
      campaignModel as never,
      segmentModel as never,
      messageModel as never,
      providerModel as never,
      guestModel as never,
      loyaltyAccountModel as never,
      voucherModel as never,
      reservationModel as never,
      waitlistModel as never,
      orderModel as never,
      accessPolicy as never,
    );

    return { service, campaignModel, messageModel, createdMessages, accessPolicy };
  }

  it('calculates standard marketing segments dynamically', async () => {
    const { service } = createService();

    const segments = await service.listSegments(actor as never);

    expect(segments.find((segment) => segment.id === 'regular-guests')).toMatchObject({
      estimatedAudience: 1,
    });
    expect(segments.find((segment) => segment.id === 'vip-guests')).toMatchObject({
      estimatedAudience: 1,
    });
    expect(segments.find((segment) => segment.id === 'no-show-guests')).toMatchObject({
      estimatedAudience: 1,
    });
  });

  it('creates tenant scoped campaigns with voucher references', async () => {
    const { service, campaignModel } = createService();

    const campaign = await service.createCampaign(
      {
        name: 'VIP Sommer',
        type: MarketingCampaignType.Vip,
        status: MarketingCampaignStatus.Scheduled,
        targetSegmentId: 'vip-guests',
        subject: 'Danke fuer deine Treue',
        message: 'Dein VIP Gutschein wartet.',
        voucherId,
      },
      actor as never,
    );

    expect(campaignModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        targetSegmentId: 'vip-guests',
        voucherId,
        createdByUserId: 'user-1',
      }),
    );
    expect(campaign).toMatchObject({ status: MarketingCampaignStatus.Scheduled });
  });

  it('archives campaigns instead of sending or deleting guest data', async () => {
    const { service } = createService();

    const archived = await service.archiveCampaign(campaignId, actor as never);

    expect(archived).toMatchObject({
      status: MarketingCampaignStatus.Cancelled,
      active: false,
    });
  });

  it('prepares queued messages only for consented recipients', async () => {
    const { service, createdMessages } = createService();

    const result = await service.prepareDelivery(
      campaignId,
      { channel: CommunicationChannel.Email },
      actor as never,
    );

    expect(createdMessages).toHaveLength(1);
    expect(createdMessages[0]).toMatchObject({
      recipient: 'mia@example.test',
      status: CampaignMessageStatus.Queued,
      channel: CommunicationChannel.Email,
    });
    expect(result).toMatchObject({ queuedCount: 1 });
  });

  it('stores failed test messages when no provider is configured', async () => {
    const { service } = createService();

    const message = await service.sendTest(
      campaignId,
      {
        channel: CommunicationChannel.Email,
        recipient: 'test@example.test',
      },
      actor as never,
    );

    expect(message).toMatchObject({
      status: CampaignMessageStatus.Failed,
      error: 'Kein aktiver Communication Provider konfiguriert',
    });
  });

  it('blocks campaign writes for non-management actors', async () => {
    const { service, accessPolicy } = createService();
    accessPolicy.isCompanyAdmin.mockReturnValue(false);

    await expect(
      service.createCampaign(
        {
          name: 'Service',
          type: MarketingCampaignType.General,
          targetSegmentId: 'new-guests',
          subject: 'Hallo',
          message: 'Willkommen',
        },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
