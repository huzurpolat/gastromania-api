import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type EmployeeFeedbackDocument = HydratedDocument<EmployeeFeedback>;

export enum FeedbackType {
  OneOnOne = 'Mitarbeitergespraech',
  Feedback = 'Feedback',
  Performance = 'Leistungsbewertung',
  Goal = 'Ziel',
  Development = 'Entwicklung',
  TrainingNeed = 'Schulungsbedarf',
}

@Schema({ timestamps: true, versionKey: false })
export class EmployeeFeedback {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  employeeId!: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ required: true, enum: Object.values(FeedbackType), index: true })
  type!: FeedbackType;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, trim: true })
  note!: string;

  @Prop({ min: 1, max: 5 })
  rating?: number;

  @Prop({ type: [String], default: [] })
  goals!: string[];

  @Prop({ type: [String], default: [] })
  developmentActions!: string[];

  @Prop()
  dueDate?: Date;

  @Prop({ required: true, trim: true })
  createdBy!: string;
}

export const EmployeeFeedbackSchema =
  SchemaFactory.createForClass(EmployeeFeedback);
