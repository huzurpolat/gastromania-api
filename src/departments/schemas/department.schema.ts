import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DepartmentDocument = HydratedDocument<Department>;

export enum DepartmentType {
  Service = 'service',
  Kueche = 'kueche',
  Lager = 'lager',
  Spuelkueche = 'spuelkueche',
  Reinigung = 'reinigung',
}

@Schema({ timestamps: true, versionKey: false })
export class Department {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  companyId!: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ required: true, trim: true, enum: Object.values(DepartmentType), index: true })
  type!: DepartmentType;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);

DepartmentSchema.index({ companyId: 1, locationId: 1, type: 1 }, { unique: true });
