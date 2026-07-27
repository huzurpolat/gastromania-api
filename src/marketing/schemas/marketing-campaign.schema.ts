import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MarketingCampaignDocument = HydratedDocument<MarketingCampaign>;

export enum MarketingCampaignType {
  Birthday = 'BIRTHDAY',
  Reactivation = 'REACTIVATION',
  Loyalty = 'LOYALTY',
  Vip = 'VIP',
  Voucher = 'VOUCHER',
  General = 'GENERAL',
}

export enum MarketingCampaignStatus {
  Draft = 'DRAFT',
  Scheduled = 'SCHEDULED',
  Active = 'ACTIVE',
  Completed = 'COMPLETED',
  Cancelled = 'CANCELLED',
}

export enum MarketingDeliveryStatus {
  NotPrepared = 'NOT_PREPARED',
  Queued = 'QUEUED',
  Sending = 'SENDING',
  Sent = 'SENT',
  PartialFailed = 'PARTIAL_FAILED',
  Failed = 'FAILED',
}

@Schema({ timestamps: true, versionKey: false })
export class MarketingCampaign {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({
    type: String,
    enum: Object.values(MarketingCampaignType),
    default: MarketingCampaignType.General,
    index: true,
  })
  type!: MarketingCampaignType;

  @Prop({
    type: String,
    enum: Object.values(MarketingCampaignStatus),
    default: MarketingCampaignStatus.Draft,
    index: true,
  })
  status!: MarketingCampaignStatus;

  @Prop({ required: true, trim: true, index: true })
  targetSegmentId!: string;

  @Prop({ required: true, trim: true })
  subject!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ trim: true, index: true })
  voucherId?: string;

  @Prop()
  scheduledAt?: Date;

  @Prop({ trim: true })
  createdByUserId?: string;

  @Prop({ trim: true, index: true })
  automationId?: string;

  @Prop({
    type: String,
    enum: Object.values(MarketingDeliveryStatus),
    default: MarketingDeliveryStatus.NotPrepared,
    index: true,
  })
  deliveryStatus!: MarketingDeliveryStatus;

  @Prop({ default: 0, min: 0 })
  queuedCount!: number;

  @Prop({ default: 0, min: 0 })
  sentCount!: number;

  @Prop({ default: 0, min: 0 })
  failedCount!: number;

  @Prop({ default: true, index: true })
  active!: boolean;
}

export const MarketingCampaignSchema =
  SchemaFactory.createForClass(MarketingCampaign);

MarketingCampaignSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
