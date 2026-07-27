import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WaitlistEntryDocument = HydratedDocument<WaitlistEntry>;

export enum WaitlistStatus {
  Waiting = 'WAITING',
  Notified = 'NOTIFIED',
  Seated = 'SEATED',
  NoShow = 'NO_SHOW',
  Cancelled = 'CANCELLED',
}

export enum WaitlistSource {
  WalkIn = 'WALK_IN',
  Phone = 'PHONE',
  Website = 'WEBSITE',
  Manual = 'MANUAL',
}

@Schema({ timestamps: true, versionKey: false })
export class WaitlistEntry {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true })
  guestName!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ required: true, min: 1 })
  guestCount!: number;

  @Prop({
    type: String,
    enum: Object.values(WaitlistStatus),
    default: WaitlistStatus.Waiting,
    index: true,
  })
  status!: WaitlistStatus;

  @Prop({ min: 0, default: 0 })
  estimatedWaitMinutes!: number;

  @Prop({ trim: true, index: true })
  preferredTableId?: string;

  @Prop({ trim: true, index: true })
  assignedTableId?: string;

  @Prop({ trim: true, index: true })
  reservationId?: string;

  @Prop({
    type: String,
    enum: Object.values(WaitlistSource),
    default: WaitlistSource.WalkIn,
  })
  source!: WaitlistSource;

  @Prop({ trim: true })
  note?: string;

  @Prop({ trim: true, index: true })
  createdByUserId?: string;

  @Prop({ trim: true, index: true })
  guestProfileId?: string;
}

export const WaitlistEntrySchema =
  SchemaFactory.createForClass(WaitlistEntry);

WaitlistEntrySchema.index({ tenantId: 1, locationId: 1, status: 1 });
WaitlistEntrySchema.index({ locationId: 1, createdAt: -1 });
WaitlistEntrySchema.index({ tenantId: 1, guestProfileId: 1 });
