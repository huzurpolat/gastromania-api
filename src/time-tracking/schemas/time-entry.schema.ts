import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TimeEntryDocument = HydratedDocument<TimeEntry>;

@Schema({ timestamps: true, versionKey: false })
export class TimeEntry {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  employeeId!: string;

  @Prop({ required: true, index: true })
  clockIn!: Date;

  @Prop({ index: true })
  clockOut?: Date;

  @Prop({ default: 0, min: 0 })
  breakMinutes!: number;

  @Prop({ trim: true })
  note?: string;
}

export const TimeEntrySchema = SchemaFactory.createForClass(TimeEntry);

TimeEntrySchema.index({ employeeId: 1, clockOut: 1 });
TimeEntrySchema.index({ locationId: 1, clockIn: 1 });
