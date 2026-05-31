import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DashboardPreferenceDocument = HydratedDocument<DashboardPreference>;

@Schema({ _id: false })
export class DashboardWidgetPreference {
  @Prop({ required: true, trim: true })
  key!: string;

  @Prop({ default: true })
  visible!: boolean;

  @Prop({ trim: true, default: 'medium' })
  size!: string;
}

export const DashboardWidgetPreferenceSchema = SchemaFactory.createForClass(
  DashboardWidgetPreference,
);

@Schema({ timestamps: true, versionKey: false })
export class DashboardPreference {
  @Prop({ required: true, unique: true, trim: true, index: true })
  userId!: string;

  @Prop({ trim: true })
  selectedLocationId?: string;

  @Prop({ trim: true, default: 'today' })
  defaultRange!: string;

  @Prop({ type: [String], default: [] })
  visibleWidgets!: string[];

  @Prop({ type: [DashboardWidgetPreferenceSchema], default: [] })
  widgets!: DashboardWidgetPreference[];
}

export const DashboardPreferenceSchema =
  SchemaFactory.createForClass(DashboardPreference);
