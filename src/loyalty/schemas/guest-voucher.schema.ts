import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GuestVoucherDocument = HydratedDocument<GuestVoucher>;

export enum GuestVoucherType {
  Amount = 'AMOUNT',
  Percent = 'PERCENT',
}

export enum GuestVoucherStatus {
  Active = 'ACTIVE',
  Redeemed = 'REDEEMED',
  Expired = 'EXPIRED',
  Cancelled = 'CANCELLED',
}

@Schema({ timestamps: true, versionKey: false })
export class GuestVoucher {
  @Prop({ required: true, trim: true, uppercase: true, index: true })
  code!: string;

  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ trim: true, index: true })
  guestProfileId?: string;

  @Prop({ required: true, min: 0 })
  value!: number;

  @Prop({
    type: String,
    enum: Object.values(GuestVoucherType),
    required: true,
  })
  type!: GuestVoucherType;

  @Prop({
    type: String,
    enum: Object.values(GuestVoucherStatus),
    default: GuestVoucherStatus.Active,
    index: true,
  })
  status!: GuestVoucherStatus;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  redeemedAt?: Date;

  @Prop({ trim: true })
  redeemedByUserId?: string;

  @Prop({ trim: true })
  note?: string;
}

export const GuestVoucherSchema = SchemaFactory.createForClass(GuestVoucher);

GuestVoucherSchema.index({ tenantId: 1, code: 1 }, { unique: true });
