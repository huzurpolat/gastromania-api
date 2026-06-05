import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
export class AuditLog {
  _id!: string;

  createdAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  actorUserId!: string;

  @Prop({ required: true, trim: true })
  actorRole!: string;

  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ required: true, trim: true, index: true })
  action!: string;

  @Prop({ required: true, trim: true, index: true })
  entityType!: string;

  @Prop({ required: true, trim: true, index: true })
  entityId!: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
AuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
