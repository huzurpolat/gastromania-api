import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffingPlanSuggestionDocument = HydratedDocument<StaffingPlanSuggestion>;

export enum StaffingPlanSuggestionStatus {
  Draft = 'DRAFT',
  Applied = 'APPLIED',
  Dismissed = 'DISMISSED',
}

export enum StaffingPlanSuggestionItemStatus {
  Open = 'OPEN',
  Applied = 'APPLIED',
  Dismissed = 'DISMISSED',
}

export type StaffingPlanSuggestionConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export class StaffingPlanSuggestionItem {
  @Prop({ required: true, trim: true })
  id!: string;

  @Prop({ required: true })
  date!: Date;

  @Prop({ trim: true, index: true })
  departmentId?: string;

  @Prop({ required: true, trim: true })
  role!: string;

  @Prop({ required: true })
  startTime!: Date;

  @Prop({ required: true })
  endTime!: Date;

  @Prop({ required: true, trim: true })
  suggestedUserId!: string;

  @Prop({ trim: true })
  sourceSuggestionId?: string;

  @Prop({ required: true, trim: true })
  confidence!: StaffingPlanSuggestionConfidence;

  @Prop({ required: true, trim: true })
  reason!: string;

  @Prop({ type: [String], default: [] })
  warnings!: string[];

  @Prop({
    type: String,
    enum: Object.values(StaffingPlanSuggestionItemStatus),
    default: StaffingPlanSuggestionItemStatus.Open,
  })
  status!: StaffingPlanSuggestionItemStatus;

  @Prop({ trim: true })
  appliedShiftId?: string;
}

@Schema({ timestamps: true, versionKey: false })
export class StaffingPlanSuggestion {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, min: 1, max: 53, index: true })
  week!: number;

  @Prop({ required: true, min: 2000, index: true })
  year!: number;

  @Prop({
    type: String,
    enum: Object.values(StaffingPlanSuggestionStatus),
    default: StaffingPlanSuggestionStatus.Draft,
    index: true,
  })
  status!: StaffingPlanSuggestionStatus;

  @Prop({ required: true, trim: true })
  generatedByUserId!: string;

  @Prop({ required: true })
  generatedAt!: Date;

  @Prop({
    type: {
      totalItems: Number,
      openItems: Number,
      appliedItems: Number,
      dismissedItems: Number,
      warningItems: Number,
      totalSuggestedHours: Number,
    },
    default: {},
  })
  summary!: {
    totalItems: number;
    openItems: number;
    appliedItems: number;
    dismissedItems: number;
    warningItems: number;
    totalSuggestedHours: number;
  };

  @Prop({ type: [StaffingPlanSuggestionItem], default: [] })
  items!: StaffingPlanSuggestionItem[];
}

export const StaffingPlanSuggestionSchema = SchemaFactory.createForClass(StaffingPlanSuggestion);

StaffingPlanSuggestionSchema.index({
  tenantId: 1,
  locationId: 1,
  week: 1,
  year: 1,
  status: 1,
});
