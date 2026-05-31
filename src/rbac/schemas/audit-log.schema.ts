import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: true, versionKey: false })
export class AuditLog {
  @Prop({ trim: true, index: true })
  actorId?: string;

  @Prop({ trim: true })
  actorEmail?: string;

  @Prop({ required: true, trim: true, index: true })
  action!: string;

  @Prop({ required: true, trim: true, index: true })
  module!: string;

  @Prop({ trim: true })
  entityId?: string;

  @Prop({ type: Object })
  oldValue?: Record<string, unknown>;

  @Prop({ type: Object })
  newValue?: Record<string, unknown>;

  @Prop({ trim: true })
  ipAddress?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ createdAt: -1 });
