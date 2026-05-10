import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../auth/enums/role.enum';

export type InternalMessageDocument = HydratedDocument<InternalMessage>;

export enum InternalMessagePriority {
  Normal = 'Normal',
  Important = 'Wichtig',
  Urgent = 'Dringend',
}

@Schema({ timestamps: true })
export class InternalMessage {
  @Prop({ required: true, trim: true })
  locationId!: string;

  @Prop({ required: true, trim: true })
  senderId!: string;

  @Prop({ required: true, trim: true })
  senderName!: string;

  @Prop({ type: [String], enum: Role, default: [] })
  senderRoles!: Role[];

  @Prop({ type: [String], enum: Role, default: [] })
  targetRoles!: Role[];

  @Prop({ required: true, trim: true, maxlength: 800 })
  message!: string;

  @Prop({
    enum: InternalMessagePriority,
    default: InternalMessagePriority.Normal,
  })
  priority!: InternalMessagePriority;
}

export const InternalMessageSchema =
  SchemaFactory.createForClass(InternalMessage);
