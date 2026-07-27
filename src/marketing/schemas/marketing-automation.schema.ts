import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MarketingAutomationDocument = HydratedDocument<MarketingAutomation>;

export enum MarketingAutomationType {
  Birthday = 'BIRTHDAY',
  Reactivation30 = 'REACTIVATION_30',
  Reactivation60 = 'REACTIVATION_60',
  Reactivation90 = 'REACTIVATION_90',
  VipUpgrade = 'VIP_UPGRADE',
  VoucherExpiring = 'VOUCHER_EXPIRING',
  Custom = 'CUSTOM',
}

@Schema({ timestamps: true, versionKey: false })
export class MarketingAutomation {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({
    type: String,
    enum: Object.values(MarketingAutomationType),
    required: true,
    index: true,
  })
  type!: MarketingAutomationType;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop({ type: Object, default: {} })
  triggerRule!: Record<string, unknown>;

  @Prop({ required: true, trim: true, index: true })
  targetSegment!: string;

  @Prop({ trim: true, index: true })
  campaignTemplateId?: string;

  @Prop({ trim: true, index: true })
  voucherTemplateId?: string;

  @Prop()
  lastRunAt?: Date;

  @Prop()
  nextRunAt?: Date;

  @Prop({ default: 0, min: 0 })
  generatedCampaignCount!: number;
}

export const MarketingAutomationSchema =
  SchemaFactory.createForClass(MarketingAutomation);

MarketingAutomationSchema.index({ tenantId: 1, active: 1, type: 1 });
