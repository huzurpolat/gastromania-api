import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GuestLoyaltyTransactionDocument =
  HydratedDocument<GuestLoyaltyTransaction>;

export enum GuestLoyaltyTransactionType {
  Earned = 'EARNED',
  Redeemed = 'REDEEMED',
  Adjustment = 'ADJUSTMENT',
}

@Schema({ timestamps: true, versionKey: false })
export class GuestLoyaltyTransaction {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true, index: true })
  guestProfileId!: string;

  @Prop({
    type: String,
    enum: Object.values(GuestLoyaltyTransactionType),
    required: true,
    index: true,
  })
  type!: GuestLoyaltyTransactionType;

  @Prop({ required: true })
  points!: number;

  @Prop({ trim: true, index: true })
  orderId?: string;

  @Prop({ trim: true })
  note?: string;
}

export const GuestLoyaltyTransactionSchema =
  SchemaFactory.createForClass(GuestLoyaltyTransaction);

GuestLoyaltyTransactionSchema.index(
  { tenantId: 1, orderId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: {
      orderId: { $exists: true, $type: 'string' },
      type: GuestLoyaltyTransactionType.Earned,
    },
  },
);
