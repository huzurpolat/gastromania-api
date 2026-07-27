import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ collection: 'audit_logs', timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
export class AuditLog {
  _id!: string;

  createdAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  actorUserId!: string;

  @Prop({ trim: true, index: true })
  actorEmail?: string;

  @Prop({ required: true, trim: true })
  actorRole!: string;

  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ required: true, trim: true, index: true })
  action!: string;

  @Prop({ required: true, trim: true, index: true, default: 'SYSTEM' })
  category!: string;

  @Prop({ required: true, trim: true, index: true })
  entityType!: string;

  @Prop({ required: true, trim: true, index: true })
  entityId!: string;

  @Prop({ trim: true })
  entityName?: string;

  @Prop({ type: Object, default: {} })
  oldValues!: Record<string, unknown>;

  @Prop({ type: Object, default: {} })
  newValues!: Record<string, unknown>;

  @Prop({ type: Boolean, default: true, index: true })
  success!: boolean;

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ trim: true })
  userAgent?: string;

  @Prop({ type: Object, default: {} })
  metadata!: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
AuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ category: 1, createdAt: -1 });
