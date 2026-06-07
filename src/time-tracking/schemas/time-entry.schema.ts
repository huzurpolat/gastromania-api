import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TimeEntryDocument = HydratedDocument<TimeEntry>;

export enum TimeEntryStatus {
  Open = 'open',
  Closed = 'closed',
  Corrected = 'corrected',
}

@Schema({ timestamps: true, versionKey: false })
export class TimeEntry {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  employeeId!: string;

  @Prop({ trim: true, index: true })
  shiftId?: string;

  @Prop({ required: true, index: true })
  clockIn!: Date;

  @Prop({ index: true })
  clockOut?: Date;

  @Prop({ default: 0, min: 0 })
  breakMinutes!: number;

  @Prop({ min: 0 })
  durationMinutes?: number;

  @Prop({ min: 0 })
  netDurationMinutes?: number;

  @Prop({ enum: TimeEntryStatus, default: TimeEntryStatus.Open, index: true })
  status!: TimeEntryStatus;

  @Prop({ trim: true })
  note?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  correctionReason?: string;

  @Prop({ trim: true, index: true })
  correctedByUserId?: string;

  @Prop()
  correctedAt?: Date;
}

export const TimeEntrySchema = SchemaFactory.createForClass(TimeEntry);

TimeEntrySchema.index({ employeeId: 1, clockOut: 1 });
TimeEntrySchema.index({ tenantId: 1, employeeId: 1, status: 1 });
TimeEntrySchema.index(
  { tenantId: 1, employeeId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: TimeEntryStatus.Open },
  },
);
TimeEntrySchema.index({ locationId: 1, clockIn: 1 });
