import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EmployeeDocumentRecordDocument =
  HydratedDocument<EmployeeDocumentRecord>;

export enum EmployeeDocumentCategory {
  Contract = 'Vertrag',
  Certificate = 'Zertifikat',
  Training = 'Schulung',
  Hygiene = 'Hygienebelehrung',
  BackgroundCheck = 'Fuehrungszeugnis',
  Proof = 'Nachweis',
  Other = 'Sonstiges',
}

@Schema({ timestamps: true, versionKey: false })
export class EmployeeDocumentRecord {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  employeeId!: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({
    required: true,
    enum: Object.values(EmployeeDocumentCategory),
    index: true,
  })
  category!: EmployeeDocumentCategory;

  @Prop({ trim: true })
  fileName?: string;

  @Prop({ trim: true })
  fileUrl?: string;

  @Prop()
  issuedAt?: Date;

  @Prop({ index: true })
  expiresAt?: Date;

  @Prop({ default: false })
  reminderSent!: boolean;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ required: true, trim: true })
  createdBy!: string;
}

export const EmployeeDocumentRecordSchema = SchemaFactory.createForClass(
  EmployeeDocumentRecord,
);
