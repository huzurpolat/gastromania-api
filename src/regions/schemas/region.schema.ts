import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RegionDocument = HydratedDocument<Region>;

@Schema({ timestamps: true, versionKey: false })
export class Region {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  companyId!: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ required: true, trim: true, uppercase: true, index: true })
  code!: string;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const RegionSchema = SchemaFactory.createForClass(Region);

RegionSchema.index({ companyId: 1, code: 1 }, { unique: true });
