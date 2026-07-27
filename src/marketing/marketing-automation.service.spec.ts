import { ForbiddenException } from '@nestjs/common';
import { CommunicationChannel } from '../communication/schemas/communication-provider.schema';
import { MarketingAutomationService } from './marketing-automation.service';
import {
  MarketingAutomationType,
} from './schemas/marketing-automation.schema';
import { MarketingCampaignStatus } from './schemas/marketing-campaign.schema';

describe('MarketingAutomationService', () => {
  const actor = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    roles: ['TenantAdmin'],
    permissions: ['reservations.view', 'reservations.create'],
  };

  function createDoc(payload: Record<string, unknown>) {
    return {
      _id: 'automation-1',
      tenantId: 'tenant-1',
      name: 'Geburtstage',
      type: MarketingAutomationType.Birthday,
      active: true,
      triggerRule: { prepareDelivery: true, channel: CommunicationChannel.Email },
      targetSegment: 'birthday-week',
      generatedCampaignCount: 0,
      save: jest.fn(async function save(this: unknown) {
        return this;
      }),
      ...payload,
    };
  }

  function createService() {
    const automationDoc = createDoc({});
    const automationModel = {
      find: jest.fn(() => ({
        sort: jest.fn(() => ({ lean: jest.fn(async () => [automationDoc]) })),
      })),
      create: jest.fn(async (payload) => createDoc(payload)),
      findOne: jest.fn(async () => automationDoc),
      findByIdAndUpdate: jest.fn(() => ({
        lean: jest.fn(async () => automationDoc),
      })),
      countDocuments: jest.fn(async () => 1),
    };
    const templateModel = {
      find: jest.fn(() => ({
        sort: jest.fn(() => ({ lean: jest.fn(async () => []) })),
      })),
      create: jest.fn(async (payload) => ({ _id: 'template-1', ...payload })),
      findOne: jest.fn(async () => null),
      findByIdAndUpdate: jest.fn(() => ({
        lean: jest.fn(async () => ({ _id: 'template-1' })),
      })),
    };
    const campaignModel = {
      findByIdAndUpdate: jest.fn(async () => ({})),
    };
    const loyaltyAccountModel = {
      countDocuments: jest.fn(async () => 2),
    };
    const marketingService = {
      createCampaignFromAutomation: jest.fn(async (payload) => ({
        _id: 'campaign-1',
        ...payload,
      })),
      prepareDelivery: jest.fn(async (id, payload) => ({
        _id: id,
        deliveryStatus: 'QUEUED',
        ...payload,
      })),
      sendCampaign: jest.fn(),
    };
    const accessPolicy = {
      isCompanyAdmin: jest.fn((user) => user.roles.includes('TenantAdmin')),
    };
    const service = new MarketingAutomationService(
      automationModel as never,
      templateModel as never,
      campaignModel as never,
      loyaltyAccountModel as never,
      marketingService as never,
      accessPolicy as never,
    );

    return {
      service,
      automationModel,
      campaignModel,
      marketingService,
      accessPolicy,
    };
  }

  it('creates campaign drafts and prepares the queue without sending automatically', async () => {
    const { service, campaignModel, marketingService } = createService();

    const result = await service.runAutomation('507f1f77bcf86cd799439011', actor as never);

    expect(marketingService.createCampaignFromAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MarketingCampaignStatus.Draft,
        targetSegmentId: 'birthday-week',
      }),
      actor,
    );
    expect(campaignModel.findByIdAndUpdate).toHaveBeenCalledWith('campaign-1', {
      automationId: 'automation-1',
    });
    expect(marketingService.prepareDelivery).toHaveBeenCalledWith(
      'campaign-1',
      { channel: CommunicationChannel.Email },
      actor,
    );
    expect(marketingService.sendCampaign).not.toHaveBeenCalled();
    expect(result.sent).toBe(false);
  });

  it('blocks automation changes for non-management users', async () => {
    const { service } = createService();
    const employee = {
      ...actor,
      roles: ['Service'],
    };

    await expect(
      service.createAutomation(
        {
          name: 'Reaktivierung',
          type: MarketingAutomationType.Reactivation30,
          targetSegment: 'reactivation-30',
        },
        employee as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
