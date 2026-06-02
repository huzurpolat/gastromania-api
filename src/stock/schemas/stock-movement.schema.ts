import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockMovementDocument = HydratedDocument<StockMovement>;

export enum StockMovementType {
  Receipt = 'Wareneingang',
  Issue = 'Warenausgang',
  Usage = 'Verbrauch',
  OrderConsumption = 'order_consumption',
  OrderCancelReversal = 'order_cancel_reversal',
  OrderQuantityAdjustment = 'order_quantity_adjustment',
  Shrinkage = 'Schwund',
  Breakage = 'Bruch',
  Spoilage = 'Verderb',
  Loss = 'Verlust',
  Correction = 'Korrektur',
  Inventory = 'Inventur',
  Transfer = 'Umbuchung',
}

@Schema({ timestamps: true, versionKey: false })
export class StockMovement {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  stockItemId!: string;

  @Prop({ trim: true, index: true })
  batchId?: string;

  @Prop({ trim: true, index: true })
  orderId?: string;

  @Prop({ trim: true, index: true })
  orderItemId?: string;

  @Prop({ trim: true, index: true })
  recipeId?: string;

  @Prop({ required: true, trim: true })
  stockItemName!: string;

  @Prop({ required: true, enum: Object.values(StockMovementType), index: true })
  type!: StockMovementType;

  @Prop({ required: true })
  quantityChange!: number;

  @Prop({ required: true, default: 0 })
  quantityBefore!: number;

  @Prop({ required: true })
  quantityAfter!: number;

  @Prop({ trim: true })
  supplierId?: string;

  @Prop({ trim: true })
  supplierName?: string;

  @Prop({ min: 0, default: 0 })
  unitPriceNet!: number;

  @Prop({ min: 0, default: 0 })
  valueNet!: number;

  @Prop({ trim: true })
  note?: string;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ required: true, trim: true })
  actorId!: string;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);

StockMovementSchema.index({ locationId: 1, createdAt: -1 });
StockMovementSchema.index({ stockItemId: 1, createdAt: -1 });
