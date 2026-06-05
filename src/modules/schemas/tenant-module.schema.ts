import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TenantModuleDocument = HydratedDocument<TenantModule>;

@Schema({ collection: 'tenant_modules', timestamps: true, versionKey: false })
export class TenantModule {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true, index: true })
  moduleKey!: string;

  @Prop({ required: true, default: true })
  enabled!: boolean;
}

export const TenantModuleSchema = SchemaFactory.createForClass(TenantModule);

TenantModuleSchema.index({ tenantId: 1, moduleKey: 1 }, { unique: true });
