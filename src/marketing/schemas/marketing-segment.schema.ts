import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MarketingSegmentDocument = HydratedDocument<MarketingSegment>;

export type MarketingSegmentRuleOperator =
  | 'lte'
  | 'gte'
  | 'eq'
  | 'in'
  | 'olderThanDays'
  | 'thisWeek'
  | 'gt';

export interface MarketingSegmentRule {
  field: string;
  operator: MarketingSegmentRuleOperator;
  value?: unknown;
}

@Schema({ timestamps: true, versionKey: false })
export class MarketingSegment {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: [Object], default: [] })
  rules!: MarketingSegmentRule[];

  @Prop({ default: 0, min: 0 })
  estimatedAudience!: number;

  @Prop({ default: true, index: true })
  active!: boolean;
}

export const MarketingSegmentSchema =
  SchemaFactory.createForClass(MarketingSegment);

MarketingSegmentSchema.index({ tenantId: 1, active: 1, name: 1 });
