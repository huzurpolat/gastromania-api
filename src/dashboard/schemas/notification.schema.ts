import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DashboardNotificationDocument =
  HydratedDocument<DashboardNotification>;

export enum DashboardNotificationSeverity {
  Info = 'info',
  Success = 'success',
  Warning = 'warning',
  Danger = 'danger',
}

@Schema({ timestamps: true, versionKey: false })
export class DashboardNotification {
  @Prop({ required: true, trim: true, index: true })
  userId!: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({
    type: String,
    enum: Object.values(DashboardNotificationSeverity),
    default: DashboardNotificationSeverity.Info,
    index: true,
  })
  severity!: DashboardNotificationSeverity;

  @Prop({ required: true, trim: true, index: true })
  source!: string;

  @Prop({ trim: true })
  referenceId?: string;

  @Prop({ default: false, index: true })
  read!: boolean;
}

export const DashboardNotificationSchema = SchemaFactory.createForClass(
  DashboardNotification,
);

DashboardNotificationSchema.index({ userId: 1, createdAt: -1 });
