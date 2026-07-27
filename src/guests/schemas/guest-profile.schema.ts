import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type GuestProfileDocument = HydratedDocument<GuestProfile>;

@Schema({ timestamps: true, versionKey: false })
export class GuestProfile {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ required: true, trim: true })
  firstName!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ trim: true, index: true })
  phone?: string;

  @Prop({ trim: true, lowercase: true, index: true })
  email?: string;

  @Prop()
  birthday?: Date;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  allergies?: string;

  @Prop({ trim: true })
  preferredArea?: string;

  @Prop({ trim: true, index: true })
  preferredTableId?: string;

  @Prop({ default: false })
  marketingConsent!: boolean;

  @Prop({ default: false })
  newsletterConsent!: boolean;

  @Prop({ default: true, index: true })
  active!: boolean;
}

export const GuestProfileSchema =
  SchemaFactory.createForClass(GuestProfile);

GuestProfileSchema.index({ tenantId: 1, email: 1 }, { sparse: true });
GuestProfileSchema.index({ tenantId: 1, phone: 1 }, { sparse: true });
GuestProfileSchema.index({ tenantId: 1, firstName: 1, lastName: 1, phone: 1 });
