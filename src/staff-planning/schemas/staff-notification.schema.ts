import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffNotificationDocument = HydratedDocument<StaffNotification>;

@Schema({ timestamps: true, versionKey: false })
export class StaffNotification {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ trim: true, index: true })
  userId?: string;

  @Prop({ trim: true, index: true })
  targetRole?: string;

  @Prop({ required: true, trim: true, index: true })
  type!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ type: Object, default: {} })
  payload!: Record<string, unknown>;

  @Prop({ default: false, index: true })
  read!: boolean;
}

export const StaffNotificationSchema =
  SchemaFactory.createForClass(StaffNotification);
