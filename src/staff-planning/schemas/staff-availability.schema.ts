import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffAvailabilityDocument = HydratedDocument<StaffAvailability>;

export enum StaffAvailabilityType {
  Available = 'AVAILABLE',
  Unavailable = 'UNAVAILABLE',
  RequestedOff = 'REQUESTED_OFF',
}

@Schema({ timestamps: true, versionKey: false })
export class StaffAvailability {
  @Prop({ trim: true, index: true })
  tenantId?: string;

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

  @Prop({ enum: StaffAvailabilityType, default: StaffAvailabilityType.Available, index: true })
  type!: StaffAvailabilityType;

  @Prop({ index: true })
  startDate?: Date;

  @Prop({ index: true })
  endDate?: Date;

  @Prop({ trim: true })
  startTime?: string;

  @Prop({ trim: true })
  endTime?: string;

  @Prop({ trim: true })
  availableFrom?: string;

  @Prop({ trim: true })
  availableTo?: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({ trim: true })
  createdBy?: string;
}

export const StaffAvailabilitySchema =
  SchemaFactory.createForClass(StaffAvailability);

StaffAvailabilitySchema.index({ userId: 1, date: 1, weekday: 1 });
StaffAvailabilitySchema.index({ userId: 1, startDate: 1, endDate: 1 });
