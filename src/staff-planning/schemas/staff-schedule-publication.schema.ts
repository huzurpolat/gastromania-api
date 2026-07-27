import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StaffSchedulePublicationDocument = HydratedDocument<StaffSchedulePublication>;

export enum StaffSchedulePublicationStatus {
  Draft = 'DRAFT',
  Published = 'PUBLISHED',
  ChangedAfterPublish = 'CHANGED_AFTER_PUBLISH',
}

@Schema({ timestamps: true, versionKey: false })
export class StaffSchedulePublication {
  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, index: true, min: 1, max: 53 })
  week!: number;

  @Prop({ required: true, index: true, min: 2000 })
  year!: number;

  @Prop({
    type: String,
    enum: Object.values(StaffSchedulePublicationStatus),
    default: StaffSchedulePublicationStatus.Draft,
    index: true,
  })
  status!: StaffSchedulePublicationStatus;

  @Prop()
  publishedAt?: Date;

  @Prop({ trim: true })
  publishedByUserId?: string;

  @Prop({ default: false, index: true })
  changedAfterPublish!: boolean;
}

export const StaffSchedulePublicationSchema =
  SchemaFactory.createForClass(StaffSchedulePublication);

StaffSchedulePublicationSchema.index(
  { tenantId: 1, locationId: 1, week: 1, year: 1 },
  { unique: true, sparse: true },
);
StaffSchedulePublicationSchema.index(
  { companyId: 1, locationId: 1, week: 1, year: 1 },
  { unique: true, sparse: true },
);
