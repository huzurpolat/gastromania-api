import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TimeCorrectionDocument = HydratedDocument<TimeCorrection>;

export enum TimeCorrectionStatus {
  Requested = 'requested',
  Approved = 'approved',
  Rejected = 'rejected',
}

@Schema({ timestamps: true, versionKey: false })
export class TimeCorrection {
  @Prop({ required: true, trim: true, index: true })
  timeEntryId!: string;

  @Prop({ required: true, trim: true, index: true })
  employeeId!: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop()
  requestedClockIn?: Date;

  @Prop()
  requestedClockOut?: Date;

  @Prop({ default: 0, min: 0 })
  requestedBreakMinutes!: number;

  @Prop({ required: true, trim: true })
  reason!: string;

  @Prop({
    type: String,
    enum: Object.values(TimeCorrectionStatus),
    default: TimeCorrectionStatus.Requested,
    index: true,
  })
  status!: TimeCorrectionStatus;

  @Prop({ trim: true, index: true })
  decidedBy?: string;

  @Prop()
  decidedAt?: Date;
}

export const TimeCorrectionSchema =
  SchemaFactory.createForClass(TimeCorrection);

TimeCorrectionSchema.index({ employeeId: 1, status: 1, createdAt: -1 });
