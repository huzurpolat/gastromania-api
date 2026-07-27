import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ForecastSnapshotDocument = HydratedDocument<ForecastSnapshot>;

@Schema({ timestamps: true, versionKey: false })
export class ForecastSnapshot {
  _id!: string;

  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, index: true })
  date!: Date;

  @Prop({ required: true, min: 0 })
  forecastRevenue!: number;

  @Prop({ required: true, min: 0 })
  actualRevenue!: number;

  @Prop({ required: true, min: 0, max: 100 })
  accuracy!: number;

  @Prop({ required: true, min: 1, max: 53, index: true })
  week!: number;

  @Prop({ required: true, index: true })
  year!: number;
}

export const ForecastSnapshotSchema = SchemaFactory.createForClass(ForecastSnapshot);

ForecastSnapshotSchema.index(
  { tenantId: 1, locationId: 1, date: 1 },
  { unique: true },
);
ForecastSnapshotSchema.index({ tenantId: 1, locationId: 1, year: 1, week: 1 });
