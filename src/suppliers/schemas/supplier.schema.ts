import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SupplierDocument = HydratedDocument<Supplier>;

@Schema({ timestamps: true, versionKey: false })
export class Supplier {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true })
  contactName?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ trim: true })
  website?: string;

  @Prop({ trim: true })
  street?: string;

  @Prop({ trim: true })
  zip?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true })
  deliveryDays?: string;

  @Prop({ trim: true })
  orderDeadline?: string;

  @Prop({ trim: true })
  minimumOrderValue?: string;

  @Prop({ trim: true })
  customerNumber?: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);

SupplierSchema.index({ locationId: 1, name: 1 }, { unique: true });
