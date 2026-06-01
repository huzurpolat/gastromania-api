import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShiftSwapRequestDocument = HydratedDocument<ShiftSwapRequest>;

export enum ShiftSwapStatus {
  Requested = 'requested',
  Accepted = 'accepted',
  Approved = 'approved',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

@Schema({ timestamps: true, versionKey: false })
export class ShiftSwapRequest {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  shiftId!: string;

  @Prop({ required: true, trim: true, index: true })
  requestedBy!: string;

  @Prop({ trim: true, index: true })
  targetUserId?: string;

  @Prop({
    type: String,
    enum: Object.values(ShiftSwapStatus),
    default: ShiftSwapStatus.Requested,
    index: true,
  })
  status!: ShiftSwapStatus;

  @Prop({ trim: true })
  note?: string;
}

export const ShiftSwapRequestSchema =
  SchemaFactory.createForClass(ShiftSwapRequest);

ShiftSwapRequestSchema.index({ shiftId: 1, requestedBy: 1, status: 1 });
