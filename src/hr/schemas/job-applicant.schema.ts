import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type JobApplicantDocument = HydratedDocument<JobApplicant>;

export enum ApplicantStatus {
  New = 'Neu',
  Screening = 'Sichtung',
  Interview = 'Vorstellungsgespraech',
  Trial = 'Probearbeit',
  Offer = 'Vertragsvorbereitung',
  Hired = 'Eingestellt',
  Rejected = 'Abgelehnt',
}

@Schema({ timestamps: true, versionKey: false })
export class JobApplicant {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ required: true, trim: true })
  firstName!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true, index: true })
  targetRole?: string;

  @Prop({ trim: true, index: true })
  department?: string;

  @Prop({
    required: true,
    enum: Object.values(ApplicantStatus),
    default: ApplicantStatus.New,
    index: true,
  })
  status!: ApplicantStatus;

  @Prop()
  interviewAt?: Date;

  @Prop()
  trialWorkAt?: Date;

  @Prop({ type: [String], default: [] })
  requestedDocuments!: string[];

  @Prop({ type: [String], default: [] })
  onboardingChecklist!: string[];

  @Prop({ trim: true })
  decisionNote?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ required: true, trim: true })
  createdBy!: string;
}

export const JobApplicantSchema = SchemaFactory.createForClass(JobApplicant);
