import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InventoryLocationDocument = HydratedDocument<InventoryLocation>;

@Schema({ timestamps: true, versionKey: false })
export class InventoryLocation {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false, index: true })
  isArchived!: boolean;
}

export const InventoryLocationSchema =
  SchemaFactory.createForClass(InventoryLocation);

InventoryLocationSchema.index({ locationId: 1, name: 1 }, { unique: true });
