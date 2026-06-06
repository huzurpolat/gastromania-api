import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CityDocument = HydratedDocument<City>;

@Schema({ timestamps: true, versionKey: false })
export class City {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true, index: true })
  areaId!: string;

  @Prop({ required: true, trim: true, index: true })
  regionId!: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const CitySchema = SchemaFactory.createForClass(City);

CitySchema.index({ tenantId: 1, regionId: 1, name: 1 }, { unique: true });
CitySchema.index({ tenantId: 1, areaId: 1, regionId: 1, isActive: 1 });
