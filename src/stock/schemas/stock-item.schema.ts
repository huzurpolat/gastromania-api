import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockItemDocument = HydratedDocument<StockItem>;

@Schema({ timestamps: true, versionKey: false })
export class StockItem {
  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ trim: true, index: true })
  articleNumber?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, trim: true, index: true })
  category!: string;

  @Prop({ required: true, trim: true })
  unit!: string;

  @Prop({ required: true, default: 0 })
  quantity!: number;

  @Prop({ required: true, min: 0, default: 0 })
  minQuantity!: number;

  @Prop({ min: 0, default: 0 })
  criticalQuantity!: number;

  @Prop({ min: 0 })
  targetQuantity?: number;

  @Prop({ trim: true, index: true })
  supplierId?: string;

  @Prop({ trim: true })
  supplierName?: string;

  @Prop({ trim: true })
  ean?: string;

  @Prop({ min: 0, default: 0 })
  purchasePriceNet!: number;

  @Prop({ min: 0, default: 0 })
  lastPurchasePrice!: number;

  @Prop({ min: 0, default: 0 })
  averageCost!: number;

  @Prop({ min: 0, default: 0 })
  unitCost!: number;

  @Prop({ trim: true })
  costUnit?: string;

  @Prop({ min: 0, default: 0 })
  purchasePriceGross!: number;

  @Prop({ min: 0, default: 0 })
  salePrice!: number;

  @Prop({ min: 0, default: 19 })
  vatRate!: number;

  @Prop({ trim: true })
  storageLocation?: string;

  @Prop({ default: false, index: true })
  requiresExpiryDate!: boolean;

  @Prop({ trim: true })
  ingredientCategory?: string;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false, index: true })
  isArchived!: boolean;
}

export const StockItemSchema = SchemaFactory.createForClass(StockItem);

StockItemSchema.index({ locationId: 1, name: 1 }, { unique: true });
StockItemSchema.index({ locationId: 1, articleNumber: 1 });
