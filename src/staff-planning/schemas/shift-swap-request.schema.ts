import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShiftSwapRequestDocument = HydratedDocument<ShiftSwapRequest>;

export enum ShiftSwapStatus {
  Open = 'OPEN',
  PendingApproval = 'PENDING_APPROVAL',
  Approved = 'APPROVED',
  Rejected = 'REJECTED',
  Cancelled = 'CANCELLED',
}

export enum ShiftSwapType {
  ShiftSwap = 'SHIFT_SWAP',
  ShiftCover = 'SHIFT_COVER',
}

@Schema({ timestamps: true, versionKey: false })
export class ShiftSwapRequest {
  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  shiftId!: string;

  @Prop({ required: true, trim: true, index: true })
  requestedBy!: string;

  @Prop({ trim: true, index: true })
  offeredByUserId?: string;

  @Prop({ trim: true, index: true })
  requestedByUserId?: string;

  @Prop({ trim: true, index: true })
  targetUserId?: string;

  @Prop({
    type: String,
    enum: Object.values(ShiftSwapType),
    default: ShiftSwapType.ShiftCover,
    index: true,
  })
  type!: ShiftSwapType;

  @Prop({
    type: String,
    enum: Object.values(ShiftSwapStatus),
    default: ShiftSwapStatus.Open,
    index: true,
  })
  status!: ShiftSwapStatus;

  @Prop({ trim: true, index: true })
  reviewedByUserId?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop({ trim: true })
  note?: string;
}

export const ShiftSwapRequestSchema =
  SchemaFactory.createForClass(ShiftSwapRequest);

ShiftSwapRequestSchema.index({ tenantId: 1, shiftId: 1, status: 1 });
ShiftSwapRequestSchema.index({ shiftId: 1, requestedBy: 1, status: 1 });
ShiftSwapRequestSchema.index({ offeredByUserId: 1, requestedByUserId: 1, status: 1 });
