import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TimeEntryBreakDocument = HydratedDocument<TimeEntryBreak>;

@Schema({ collection: 'time_entry_breaks', timestamps: true, versionKey: false })
export class TimeEntryBreak {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true, index: true })
  timeEntryId!: string;

  @Prop({ required: true, index: true })
  breakStartAt!: Date;

  @Prop({ index: true })
  breakEndAt?: Date;

  @Prop({ min: 0, default: 0 })
  durationMinutes!: number;

  @Prop({ trim: true })
  notes?: string;
}

export const TimeEntryBreakSchema =
  SchemaFactory.createForClass(TimeEntryBreak);

TimeEntryBreakSchema.index({ tenantId: 1, timeEntryId: 1, breakStartAt: -1 });
TimeEntryBreakSchema.index(
  { tenantId: 1, timeEntryId: 1, breakEndAt: 1 },
  {
    unique: true,
    partialFilterExpression: { breakEndAt: { $exists: false } },
  },
);
