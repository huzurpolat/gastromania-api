import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MarketingCampaignType } from './marketing-campaign.schema';

export type CampaignTemplateDocument = HydratedDocument<CampaignTemplate>;

@Schema({ timestamps: true, versionKey: false })
export class CampaignTemplate {
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

  @Prop({ required: true, trim: true })
  subject!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ default: true, index: true })
  active!: boolean;
}

export const CampaignTemplateSchema =
  SchemaFactory.createForClass(CampaignTemplate);

CampaignTemplateSchema.index({ tenantId: 1, active: 1, type: 1 });
