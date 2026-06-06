import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RegionDocument = HydratedDocument<Region>;

@Schema({ timestamps: true, versionKey: false })
export class Region {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  areaId?: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  code!: string;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const RegionSchema = SchemaFactory.createForClass(Region);

RegionSchema.index({ tenantId: 1, code: 1 }, { unique: true });
RegionSchema.index({ tenantId: 1, areaId: 1, name: 1 }, { unique: true });
RegionSchema.index({ tenantId: 1, areaId: 1, isActive: 1 });
