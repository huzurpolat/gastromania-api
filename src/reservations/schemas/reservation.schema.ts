import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReservationDocument = HydratedDocument<Reservation>;

export enum ReservationStatus {
  Requested = 'Angefragt',
  Confirmed = 'Bestätigt',
  CheckedIn = 'Eingecheckt',
  Cancelled = 'Storniert',
  NoShow = 'NoShow',
}

@Schema({ timestamps: true, versionKey: false })
export class Reservation {
  @Prop({ required: true, trim: true, index: true })
  guestName!: string;

  @Prop({ trim: true })
  guestPhone?: string;

  @Prop({ trim: true, lowercase: true })
  guestEmail?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  tableId!: string;

  @Prop({ required: true, min: 1 })
  partySize!: number;

  @Prop({ required: true, index: true })
  startTime!: Date;

  @Prop({ required: true, index: true })
  endTime!: Date;

  @Prop({
    type: String,
    enum: Object.values(ReservationStatus),
    default: ReservationStatus.Requested,
    index: true,
  })
  status!: ReservationStatus;

  @Prop({ trim: true })
  notes?: string;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);

ReservationSchema.index({ locationId: 1, startTime: 1 });
ReservationSchema.index({ tableId: 1, startTime: 1, endTime: 1 });
