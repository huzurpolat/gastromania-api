import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffAvailabilityDocument = HydratedDocument<StaffAvailability>;

@Schema({ timestamps: true, versionKey: false })
export class StaffAvailability {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  userId!: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ min: 0, max: 6, index: true })
  weekday?: number;

  @Prop({ index: true })
  date?: Date;

  @Prop({ required: true, trim: true })
  availableFrom!: string;

  @Prop({ required: true, trim: true })
  availableTo!: string;

  @Prop({ trim: true })
  note?: string;
}

export const StaffAvailabilitySchema =
  SchemaFactory.createForClass(StaffAvailability);

StaffAvailabilitySchema.index({ userId: 1, date: 1, weekday: 1 });
