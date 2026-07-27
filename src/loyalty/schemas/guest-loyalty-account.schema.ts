import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GuestLoyaltyAccountDocument =
  HydratedDocument<GuestLoyaltyAccount>;

export enum GuestLoyaltyTier {
  Bronze = 'BRONZE',
  Silver = 'SILVER',
  Gold = 'GOLD',
  Platinum = 'PLATINUM',
}

@Schema({ timestamps: true, versionKey: false })
export class GuestLoyaltyAccount {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ required: true, trim: true, index: true })
  guestProfileId!: string;

  @Prop({ default: 0, min: 0 })
  pointsBalance!: number;

  @Prop({ default: 0, min: 0 })
  lifetimePoints!: number;

  @Prop({ default: 0, min: 0 })
  lifetimeRevenue!: number;

  @Prop({ default: 0, min: 0 })
  totalVisits!: number;

  @Prop({
    type: String,
    enum: Object.values(GuestLoyaltyTier),
    default: GuestLoyaltyTier.Bronze,
    index: true,
  })
  tier!: GuestLoyaltyTier;
}

export const GuestLoyaltyAccountSchema =
  SchemaFactory.createForClass(GuestLoyaltyAccount);

GuestLoyaltyAccountSchema.index(
  { tenantId: 1, guestProfileId: 1 },
  { unique: true },
);
