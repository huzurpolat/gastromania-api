import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AreaDocument = HydratedDocument<Area>;

@Schema({ timestamps: true, versionKey: false })
export class Area {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const AreaSchema = SchemaFactory.createForClass(Area);

AreaSchema.index({ tenantId: 1, name: 1 }, { unique: true });
