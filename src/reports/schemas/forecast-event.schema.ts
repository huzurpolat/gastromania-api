import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ForecastEventDocument = HydratedDocument<ForecastEvent>;

@Schema({ timestamps: true, versionKey: false })
export class ForecastEvent {
  _id!: string;

  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, index: true })
  date!: Date;

  @Prop({ required: true, min: -100, max: 300 })
  impactPercent!: number;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop({ trim: true })
  createdByUserId?: string;
}

export const ForecastEventSchema = SchemaFactory.createForClass(ForecastEvent);

ForecastEventSchema.index({ tenantId: 1, locationId: 1, date: 1, active: 1 });
