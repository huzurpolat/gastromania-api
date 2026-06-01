import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InventoryBatchDocument = HydratedDocument<InventoryBatch>;

@Schema({ timestamps: true, versionKey: false })
export class InventoryBatch {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  stockItemId!: string;

  @Prop({ required: true, trim: true })
  stockItemName!: string;

  @Prop({ required: true, trim: true })
  unit!: string;

  @Prop({ trim: true, index: true })
  batchNumber?: string;

  @Prop({ required: true, min: 0 })
  initialQuantity!: number;

  @Prop({ required: true, min: 0 })
  remainingQuantity!: number;

  @Prop({ min: 0, default: 0 })
  unitPriceNet!: number;

  @Prop({ trim: true, index: true })
  supplierId?: string;

  @Prop({ trim: true })
  supplierName?: string;

  @Prop({ trim: true })
  storageLocation?: string;

  @Prop({ index: true })
  receivedAt!: Date;

  @Prop({ index: true })
  expiresAt?: Date;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const InventoryBatchSchema = SchemaFactory.createForClass(InventoryBatch);

InventoryBatchSchema.index({ locationId: 1, stockItemId: 1, expiresAt: 1, receivedAt: 1 });
InventoryBatchSchema.index({ locationId: 1, expiresAt: 1 });
