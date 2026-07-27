import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShiftTemplateDocument = HydratedDocument<ShiftTemplate>;

@Schema({ timestamps: true, versionKey: false })
export class ShiftTemplate {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ trim: true, index: true })
  departmentId?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  roleNeeded!: string;

  @Prop({ required: true, trim: true })
  startTime!: string;

  @Prop({ required: true, trim: true })
  endTime!: string;

  @Prop({ default: 0, min: 0 })
  breakMinutes!: number;

  @Prop({ default: 1, min: 1 })
  requiredStaffCount!: number;

  @Prop({ trim: true })
  area?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const ShiftTemplateSchema = SchemaFactory.createForClass(ShiftTemplate);

ShiftTemplateSchema.index({ companyId: 1, locationId: 1, name: 1 });
