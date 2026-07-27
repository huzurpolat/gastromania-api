import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffWorkingTimeSettingsDocument =
  HydratedDocument<StaffWorkingTimeSettings>;

@Schema({ timestamps: true, versionKey: false })
export class StaffWorkingTimeSettings {
  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ default: 10, min: 0 })
  maxDailyHours!: number;

  @Prop({ default: 48, min: 0 })
  maxWeeklyHours!: number;

  @Prop({ default: 192, min: 0 })
  maxMonthlyHours!: number;

  @Prop({ default: 5, min: 0 })
  overtimeWarningThresholdHours!: number;

  @Prop({ default: 2, min: 0 })
  varianceWarningThresholdHours!: number;

  @Prop({ default: 30, min: 0, max: 100 })
  laborCostWarningThresholdPercent!: number;

  @Prop({ trim: true })
  updatedByUserId?: string;
}

export const StaffWorkingTimeSettingsSchema =
  SchemaFactory.createForClass(StaffWorkingTimeSettings);

StaffWorkingTimeSettingsSchema.index(
  { tenantId: 1 },
  { unique: true, sparse: true },
);
StaffWorkingTimeSettingsSchema.index(
  { companyId: 1 },
  { unique: true, sparse: true },
);
