import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockItemDocument = HydratedDocument<StockItem>;

@Schema({ timestamps: true, versionKey: false })
export class StockItem {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ required: true, trim: true, index: true })
  category!: string;

  @Prop({ required: true, trim: true })
  unit!: string;

  @Prop({ required: true, min: 0, default: 0 })
  quantity!: number;

  @Prop({ required: true, min: 0, default: 0 })
  minQuantity!: number;

  @Prop({ min: 0 })
  targetQuantity?: number;

  @Prop({ trim: true, index: true })
  supplierId?: string;

  @Prop({ trim: true })
  supplierName?: string;

  @Prop({ trim: true })
  storageLocation?: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: true })
  isActive!: boolean;
}

export const StockItemSchema = SchemaFactory.createForClass(StockItem);

StockItemSchema.index({ locationId: 1, name: 1 }, { unique: true });
