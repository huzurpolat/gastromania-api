import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffAbsenceDocument = HydratedDocument<StaffAbsence>;

export enum StaffAbsenceType {
  Vacation = 'vacation',
  Sick = 'sick',
  Unavailable = 'unavailable',
  Other = 'other',
}

export enum StaffAbsenceStatus {
  Requested = 'requested',
  Approved = 'approved',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

@Schema({ timestamps: true, versionKey: false })
export class StaffAbsence {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  userId!: string;

  @Prop({
    type: String,
    enum: Object.values(StaffAbsenceType),
    required: true,
    index: true,
  })
  type!: StaffAbsenceType;

  @Prop({ required: true, index: true })
  startDate!: Date;

  @Prop({ required: true, index: true })
  endDate!: Date;

  @Prop({
    type: String,
    enum: Object.values(StaffAbsenceStatus),
    default: StaffAbsenceStatus.Requested,
    index: true,
  })
  status!: StaffAbsenceStatus;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ trim: true, index: true })
  approvedBy?: string;

  @Prop()
  approvedAt?: Date;
}

export const StaffAbsenceSchema = SchemaFactory.createForClass(StaffAbsence);

StaffAbsenceSchema.index({ userId: 1, status: 1, startDate: 1, endDate: 1 });
