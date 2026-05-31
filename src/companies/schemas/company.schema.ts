import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CompanyDocument = HydratedDocument<Company>;

@Schema({ timestamps: true, versionKey: false })
export class Company {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ default: 'restaurant', trim: true, index: true })
  type!: string;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const CompanySchema = SchemaFactory.createForClass(Company);

CompanySchema.index({ name: 1 }, { unique: true });
