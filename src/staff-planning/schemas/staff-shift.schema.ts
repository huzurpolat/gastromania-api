import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffShiftDocument = HydratedDocument<StaffShift>;

export enum StaffShiftStatus {
  Draft = 'draft',
  Published = 'published',
  Active = 'active',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

@Schema({ timestamps: true, versionKey: false })
export class StaffShift {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  regionId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ trim: true, index: true })
  departmentId?: string;

  @Prop({ required: true, trim: true, index: true })
  roleNeeded!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, index: true })
  startTime!: Date;

  @Prop({ required: true, index: true })
  endTime!: Date;

  @Prop({
    type: String,
    enum: Object.values(StaffShiftStatus),
    default: StaffShiftStatus.Draft,
    index: true,
  })
  status!: StaffShiftStatus;

  @Prop({ required: true, min: 1, default: 1 })
  requiredStaffCount!: number;

  @Prop({ type: [String], default: [], index: true })
  assignedUserIds!: string[];

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true, index: true })
  createdBy!: string;

  @Prop({ trim: true, index: true })
  publishedBy?: string;

  @Prop()
  publishedAt?: Date;
}

export const StaffShiftSchema = SchemaFactory.createForClass(StaffShift);

StaffShiftSchema.index({ locationId: 1, startTime: 1, endTime: 1 });
StaffShiftSchema.index({ assignedUserIds: 1, startTime: 1, endTime: 1 });
