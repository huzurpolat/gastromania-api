import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CommunicationChannel, CommunicationProviderKey } from './communication-provider.schema';

export type CampaignMessageDocument = HydratedDocument<CampaignMessage>;

export enum CampaignMessageStatus {
  Draft = 'DRAFT',
  Queued = 'QUEUED',
  Sent = 'SENT',
  Failed = 'FAILED',
  Cancelled = 'CANCELLED',
}

@Schema({ timestamps: true, versionKey: false })
export class CampaignMessage {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true, index: true })
  campaignId!: string;

  @Prop({ required: true, trim: true, index: true })
  guestProfileId!: string;

  @Prop({
    type: String,
    enum: Object.values(CommunicationChannel),
    required: true,
    index: true,
  })
  channel!: CommunicationChannel;

  @Prop({ required: true, trim: true, index: true })
  recipient!: string;

  @Prop({ trim: true })
  subject?: string;

  @Prop({ required: true, trim: true })
  body!: string;

  @Prop({
    type: String,
    enum: Object.values(CampaignMessageStatus),
    default: CampaignMessageStatus.Draft,
    index: true,
  })
  status!: CampaignMessageStatus;

  @Prop({
    type: String,
    enum: Object.values(CommunicationProviderKey),
    trim: true,
  })
  provider?: CommunicationProviderKey;

  @Prop({ trim: true })
  providerMessageId?: string;

  @Prop({ trim: true })
  error?: string;

  @Prop()
  sentAt?: Date;

  @Prop()
  openedAt?: Date;

  @Prop()
  clickedAt?: Date;
}

export const CampaignMessageSchema =
  SchemaFactory.createForClass(CampaignMessage);

CampaignMessageSchema.index({
  tenantId: 1,
  campaignId: 1,
  guestProfileId: 1,
  channel: 1,
});
CampaignMessageSchema.index({ tenantId: 1, guestProfileId: 1, createdAt: -1 });
