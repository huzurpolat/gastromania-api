import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MarginAnalysisRunDocument = HydratedDocument<MarginAnalysisRun>;

@Schema({ timestamps: true, versionKey: false })
export class MarginAnalysisRun {
  @Prop({ required: true, trim: true, index: true })
  actorId!: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  regionId?: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ required: true, trim: true })
  range!: string;

  @Prop({ required: true })
  from!: Date;

  @Prop({ required: true })
  to!: Date;

  @Prop({ required: true, trim: true })
  costBasis!: string;

  @Prop({ required: true, min: 0, default: 0 })
  warningsCount!: number;

  @Prop({ type: [String], default: [] })
  warnings!: string[];
}

export const MarginAnalysisRunSchema =
  SchemaFactory.createForClass(MarginAnalysisRun);
