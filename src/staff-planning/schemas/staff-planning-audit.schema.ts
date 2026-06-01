import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffPlanningAuditDocument = HydratedDocument<StaffPlanningAudit>;

@Schema({ timestamps: true, versionKey: false })
export class StaffPlanningAudit {
  @Prop({ required: true, trim: true, index: true })
  userId!: string;

  @Prop({ trim: true })
  role?: string;

  @Prop({ required: true, trim: true, index: true })
  action!: string;

  @Prop({ type: Object })
  previousValue?: Record<string, unknown>;

  @Prop({ type: Object })
  newValue?: Record<string, unknown>;

  @Prop({ required: true, index: true })
  timestamp!: Date;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ trim: true, index: true })
  shiftId?: string;

  @Prop({ trim: true })
  note?: string;
}

export const StaffPlanningAuditSchema =
  SchemaFactory.createForClass(StaffPlanningAudit);
