import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReservationDocument = HydratedDocument<Reservation>;

export enum ReservationStatus {
  Reserved = 'RESERVED',
  Confirmed = 'CONFIRMED',
  CheckedIn = 'CHECKED_IN',
  Completed = 'COMPLETED',
  NoShow = 'NO_SHOW',
  Cancelled = 'CANCELLED',
  Requested = 'RESERVED',
}

export enum ReservationSource {
  Phone = 'PHONE',
  WalkIn = 'WALK_IN',
  Website = 'WEBSITE',
  Manual = 'MANUAL',
}

@Schema({ timestamps: true, versionKey: false })
export class Reservation {
  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ trim: true, index: true, unique: true, sparse: true })
  reservationNumber?: string;

  @Prop({ required: true, trim: true, index: true })
  guestName!: string;

  @Prop({ trim: true })
  guestPhone?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true, lowercase: true })
  guestEmail?: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ trim: true, index: true })
  tableId?: string;

  @Prop({ required: true, min: 1 })
  partySize!: number;

  @Prop({ min: 1 })
  guestCount?: number;

  @Prop({ index: true })
  reservationDate?: Date;

  @Prop({ required: true, index: true })
  startTime!: Date;

  @Prop({ required: true, index: true })
  endTime!: Date;

  @Prop({
    type: String,
    enum: Object.values(ReservationStatus),
    default: ReservationStatus.Reserved,
    index: true,
  })
  status!: ReservationStatus;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({
    type: String,
    enum: Object.values(ReservationSource),
    default: ReservationSource.Manual,
    index: true,
  })
  source!: ReservationSource;

  @Prop({ trim: true, index: true })
  createdByUserId?: string;

  @Prop({ trim: true, index: true })
  guestProfileId?: string;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

ReservationSchema.index({ locationId: 1, startTime: 1 });
ReservationSchema.index({ tableId: 1, startTime: 1, endTime: 1 });
ReservationSchema.index({ tenantId: 1, locationId: 1, startTime: 1 });
ReservationSchema.index({ tenantId: 1, locationId: 1, reservationDate: 1 });
ReservationSchema.index({ tenantId: 1, guestProfileId: 1 });
