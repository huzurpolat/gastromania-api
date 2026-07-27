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
import { CommunicationChannel } from '../communication/schemas/communication-provider.schema';
import { GuestLoyaltyAccount, GuestLoyaltyTier } from '../loyalty/schemas/guest-loyalty-account.schema';
import {
  CreateCampaignTemplateDto,
  UpdateCampaignTemplateDto,
} from './dto/campaign-template.dto';
import {
  CreateMarketingAutomationDto,
  UpdateMarketingAutomationDto,
} from './dto/marketing-automation.dto';
import { MarketingService } from './marketing.service';
import {
  CampaignTemplate,
  CampaignTemplateDocument,
} from './schemas/campaign-template.schema';
import {
  MarketingAutomation,
  MarketingAutomationDocument,
  MarketingAutomationType,
} from './schemas/marketing-automation.schema';
import {
  MarketingCampaign,
  MarketingCampaignStatus,
  MarketingCampaignType,
} from './schemas/marketing-campaign.schema';

interface AutomationRunRule {
  prepareDelivery?: boolean;
  channel?: CommunicationChannel;
}

@Injectable()
export class MarketingAutomationService {
  constructor(
    @InjectModel(MarketingAutomation.name)
    private readonly automationModel: Model<MarketingAutomationDocument>,
    @InjectModel(CampaignTemplate.name)
    private readonly templateModel: Model<CampaignTemplateDocument>,
    @InjectModel(MarketingCampaign.name)
    private readonly campaignModel: Model<MarketingCampaign>,
    @InjectModel(GuestLoyaltyAccount.name)
    private readonly loyaltyAccountModel: Model<GuestLoyaltyAccount>,
    private readonly marketingService: MarketingService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async listAutomations(actor: AuthenticatedUser) {
    this.assertTenant(actor);
    return this.automationModel
      .find({ tenantId: actor.tenantId, active: { $ne: false } })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async createAutomation(
    payload: CreateMarketingAutomationDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManage(actor);
    return this.automationModel.create({
      ...payload,
      tenantId: actor.tenantId,
      active: payload.active ?? true,
      targetSegment: payload.targetSegment || this.defaultSegment(payload.type),
      nextRunAt: payload.nextRunAt ? new Date(payload.nextRunAt) : undefined,
      generatedCampaignCount: 0,
    });
  }

  async updateAutomation(
    id: string,
    payload: UpdateMarketingAutomationDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManage(actor);
    await this.getAutomationOrThrow(id, actor);
    const updated = await this.automationModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          nextRunAt: payload.nextRunAt ? new Date(payload.nextRunAt) : payload.nextRunAt,
        },
        { returnDocument: 'after', runValidators: true },
      )
      .lean();

    if (!updated) {
      throw new NotFoundException('Automation nicht gefunden');
    }

    return updated;
  }

  async deleteAutomation(id: string, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const automation = await this.getAutomationOrThrow(id, actor);
    automation.active = false;
    return automation.save();
  }

  async runAutomation(id: string, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const automation = await this.getAutomationOrThrow(id, actor);
    if (!automation.active) {
      throw new BadRequestException('Automation ist inaktiv');
    }

    const template = automation.campaignTemplateId
      ? await this.getTemplateOrThrow(automation.campaignTemplateId, actor)
      : null;
    const defaults = this.defaultCampaignContent(automation.type);
    const targetSegment = automation.targetSegment || this.defaultSegment(automation.type);
    const campaign = await this.marketingService.createCampaignFromAutomation(
      {
        name: `${automation.name} ${new Date().toISOString().slice(0, 10)}`,
        type: template?.type ?? defaults.type,
        status: MarketingCampaignStatus.Draft,
        targetSegmentId: targetSegment,
        subject: template?.subject ?? defaults.subject,
        message: template?.message ?? defaults.message,
        voucherId: automation.voucherTemplateId,
      },
      actor,
    );

    await this.campaignModel.findByIdAndUpdate(campaign._id, {
      automationId: String(automation._id),
    });

    const rule = automation.triggerRule as AutomationRunRule;
    let preparedCampaign: MarketingCampaign | null = null;
    if (rule.prepareDelivery && rule.channel) {
      preparedCampaign = await this.marketingService.prepareDelivery(
        String(campaign._id),
        { channel: rule.channel },
        actor,
      ) as MarketingCampaign;
    }

    automation.lastRunAt = new Date();
    automation.nextRunAt = this.resolveNextRunAt(automation);
    automation.generatedCampaignCount = (automation.generatedCampaignCount ?? 0) + 1;
    await automation.save();

    return {
      automation,
      campaign: preparedCampaign ?? campaign,
      deliveryPrepared: Boolean(preparedCampaign),
      sent: false,
      note: 'Automation erzeugt nur Kampagnen/Queues. Versand bleibt Benutzerfreigabe.',
    };
  }

  async listTemplates(actor: AuthenticatedUser) {
    this.assertTenant(actor);
    return this.templateModel
      .find({ tenantId: actor.tenantId, active: { $ne: false } })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async createTemplate(
    payload: CreateCampaignTemplateDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManage(actor);
    return this.templateModel.create({
      ...payload,
      tenantId: actor.tenantId,
      active: payload.active ?? true,
    });
  }

  async updateTemplate(
    id: string,
    payload: UpdateCampaignTemplateDto,
    actor: AuthenticatedUser,
  ) {
    this.assertCanManage(actor);
    await this.getTemplateOrThrow(id, actor);
    const updated = await this.templateModel
      .findByIdAndUpdate(id, payload, {
        returnDocument: 'after',
        runValidators: true,
      })
      .lean();
    if (!updated) {
      throw new NotFoundException('Template nicht gefunden');
    }
    return updated;
  }

  async deleteTemplate(id: string, actor: AuthenticatedUser) {
    this.assertCanManage(actor);
    const template = await this.getTemplateOrThrow(id, actor);
    template.active = false;
    return template.save();
  }

  async countVipUpgradeCandidates(tenantId: string) {
    return this.loyaltyAccountModel.countDocuments({
      tenantId,
      tier: {
        $in: [
          GuestLoyaltyTier.Silver,
          GuestLoyaltyTier.Gold,
          GuestLoyaltyTier.Platinum,
        ],
      },
    });
  }

  private async getAutomationOrThrow(id: string, actor: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Automation nicht gefunden');
    }
    const automation = await this.automationModel.findOne({
      _id: id,
      tenantId: actor.tenantId,
    });
    if (!automation) {
      throw new NotFoundException('Automation nicht gefunden');
    }
    return automation;
  }

  private async getTemplateOrThrow(id: string, actor: AuthenticatedUser) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Template nicht gefunden');
    }
    const template = await this.templateModel.findOne({
      _id: id,
      tenantId: actor.tenantId,
      active: { $ne: false },
    });
    if (!template) {
      throw new NotFoundException('Template nicht gefunden');
    }
    return template;
  }

  private defaultSegment(type: MarketingAutomationType) {
    const map: Record<MarketingAutomationType, string> = {
      [MarketingAutomationType.Birthday]: 'birthday-week',
      [MarketingAutomationType.Reactivation30]: 'reactivation-30',
      [MarketingAutomationType.Reactivation60]: 'reactivation-60',
      [MarketingAutomationType.Reactivation90]: 'reactivation-90',
      [MarketingAutomationType.VipUpgrade]: 'loyalty-upgrade',
      [MarketingAutomationType.VoucherExpiring]: 'voucher-expiring',
      [MarketingAutomationType.Custom]: 'new-guests',
    };
    return map[type];
  }

  private defaultCampaignContent(type: MarketingAutomationType) {
    const map: Record<
      MarketingAutomationType,
      { type: MarketingCampaignType; subject: string; message: string }
    > = {
      [MarketingAutomationType.Birthday]: {
        type: MarketingCampaignType.Birthday,
        subject: 'Alles Gute zum Geburtstag',
        message: 'Wir wuenschen dir alles Gute und freuen uns auf deinen naechsten Besuch.',
      },
      [MarketingAutomationType.Reactivation30]: {
        type: MarketingCampaignType.Reactivation,
        subject: 'Wir vermissen dich',
        message: 'Schau bald wieder vorbei. Dein Tisch wartet schon.',
      },
      [MarketingAutomationType.Reactivation60]: {
        type: MarketingCampaignType.Reactivation,
        subject: 'Zeit fuer deinen naechsten Besuch',
        message: 'Seit deinem letzten Besuch ist etwas Zeit vergangen. Wir freuen uns auf dich.',
      },
      [MarketingAutomationType.Reactivation90]: {
        type: MarketingCampaignType.Reactivation,
        subject: 'Komm mal wieder vorbei',
        message: 'Wir haben dich lange nicht gesehen und freuen uns auf deinen Besuch.',
      },
      [MarketingAutomationType.VipUpgrade]: {
        type: MarketingCampaignType.Vip,
        subject: 'Dein VIP Status wartet',
        message: 'Danke fuer deine Treue. Dein neuer Status ist freigeschaltet.',
      },
      [MarketingAutomationType.VoucherExpiring]: {
        type: MarketingCampaignType.Voucher,
        subject: 'Dein Gutschein laeuft bald ab',
        message: 'Nutze deinen Gutschein vor Ablauf bei deinem naechsten Besuch.',
      },
      [MarketingAutomationType.Custom]: {
        type: MarketingCampaignType.General,
        subject: 'Neuigkeiten aus deinem Restaurant',
        message: 'Wir haben Neuigkeiten fuer dich.',
      },
    };
    return map[type];
  }

  private resolveNextRunAt(automation: MarketingAutomationDocument) {
    const intervalDays = Number(automation.triggerRule?.['intervalDays'] ?? 1);
    const next = new Date();
    next.setDate(next.getDate() + Math.max(1, intervalDays));
    return next;
  }

  private assertTenant(actor: AuthenticatedUser) {
    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext fuer Marketing Automation');
    }
  }

  private assertCanManage(actor: AuthenticatedUser) {
    this.assertTenant(actor);
    if (!this.accessPolicy.isCompanyAdmin(actor)) {
      throw new ForbiddenException('Nur Tenant Admin darf Automationen bearbeiten');
    }
  }
}
