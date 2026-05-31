import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InventoryCategoryDocument = HydratedDocument<InventoryCategory>;

@Schema({ timestamps: true, versionKey: false })
export class InventoryCategory {
  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false, index: true })
  isArchived!: boolean;
}

export const InventoryCategorySchema =
  SchemaFactory.createForClass(InventoryCategory);

InventoryCategorySchema.index({ name: 1 }, { unique: true });
