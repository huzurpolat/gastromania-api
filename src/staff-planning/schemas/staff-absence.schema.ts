import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffAbsenceDocument = HydratedDocument<StaffAbsence>;

export enum StaffAbsenceType {
  Vacation = 'vacation',
  Sick = 'sick',
  Unpaid = 'unpaid',
  Unavailable = 'unavailable',
  Other = 'other',
}

export enum StaffAbsenceStatus {
  Pending = 'pending',
  Requested = 'requested',
  Approved = 'approved',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

@Schema({ timestamps: true, versionKey: false })
export class StaffAbsence {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ required: true, trim: true, index: true })
  userId!: string;

  @Prop({ trim: true, index: true })
  employeeId?: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

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

  @Prop({ trim: true })
  startTime?: string;

  @Prop({ trim: true })
  endTime?: string;

  @Prop({ trim: true, maxlength: 1000 })
  managerNote?: string;

  @Prop({ trim: true, index: true })
  requestedByUserId?: string;

  @Prop({ trim: true, index: true })
  reviewedByUserId?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop({ default: false })
  hasShiftConflicts?: boolean;

  @Prop({ default: 0, min: 0 })
  shiftConflictCount?: number;

  @Prop({ trim: true, index: true })
  approvedBy?: string;

  @Prop()
  approvedAt?: Date;
}

export const StaffAbsenceSchema = SchemaFactory.createForClass(StaffAbsence);

StaffAbsenceSchema.index({ userId: 1, status: 1, startDate: 1, endDate: 1 });
StaffAbsenceSchema.index({ tenantId: 1, locationId: 1, status: 1, startDate: 1, endDate: 1 });
StaffAbsenceSchema.index({ tenantId: 1, employeeId: 1, status: 1, startDate: 1, endDate: 1 });
