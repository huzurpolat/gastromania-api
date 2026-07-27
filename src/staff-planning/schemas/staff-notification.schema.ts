import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffNotificationDocument = HydratedDocument<StaffNotification>;

@Schema({ timestamps: true, versionKey: false })
export class StaffNotification {
  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ trim: true, index: true })
  userId?: string;

  @Prop({ trim: true, index: true })
  recipientUserId?: string;

  @Prop({ trim: true, index: true })
  targetRole?: string;

  @Prop({ required: true, trim: true, index: true })
  type!: string;

  @Prop({ trim: true })
  title?: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ trim: true, index: true })
  relatedEntityType?: string;

  @Prop({ trim: true, index: true })
  relatedEntityId?: string;

  @Prop({ type: Object, default: {} })
  payload!: Record<string, unknown>;

  @Prop({ default: false, index: true })
  read!: boolean;

  @Prop()
  readAt?: Date;
}

export const StaffNotificationSchema =
  SchemaFactory.createForClass(StaffNotification);

StaffNotificationSchema.index({ recipientUserId: 1, read: 1, createdAt: -1 });
StaffNotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
