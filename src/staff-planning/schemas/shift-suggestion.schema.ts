import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShiftSuggestionDocument = HydratedDocument<ShiftSuggestion>;

export enum ShiftSuggestionStatus {
  Open = 'OPEN',
  Applied = 'APPLIED',
  Dismissed = 'DISMISSED',
}

@Schema({ timestamps: true, versionKey: false })
export class ShiftSuggestion {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ trim: true, index: true })
  departmentId?: string;

  @Prop({ required: true, index: true })
  date!: Date;

  @Prop({ required: true, trim: true, index: true })
  role!: string;

  @Prop({ required: true })
  startTime!: Date;

  @Prop({ required: true })
  endTime!: Date;

  @Prop({ required: true, min: 0 })
  requiredHours!: number;

  @Prop({ type: [String], default: [] })
  suggestedUserIds!: string[];

  @Prop({ trim: true })
  sourceForecastId?: string;

  @Prop({
    type: String,
    enum: Object.values(ShiftSuggestionStatus),
    default: ShiftSuggestionStatus.Open,
    index: true,
  })
  status!: ShiftSuggestionStatus;

  @Prop({ trim: true })
  appliedShiftId?: string;

  @Prop({ trim: true })
  createdByUserId?: string;
}

export const ShiftSuggestionSchema = SchemaFactory.createForClass(ShiftSuggestion);

ShiftSuggestionSchema.index({
  tenantId: 1,
  locationId: 1,
  departmentId: 1,
  date: 1,
  status: 1,
});
