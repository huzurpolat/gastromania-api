import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InventoryCountDocument = HydratedDocument<InventoryCount>;

@Schema({ timestamps: true, versionKey: false })
export class InventoryCount {
  @Prop({ required: true, trim: true, index: true })
  sessionId!: string;

  @Prop({ required: true, trim: true, index: true })
  stockItemId!: string;

  @Prop({ required: true, trim: true })
  stockItemName!: string;

  @Prop({ required: true })
  expectedQuantity!: number;

  @Prop({ required: true })
  countedQuantity!: number;

  @Prop({ required: true })
  difference!: number;

  @Prop({ required: true, default: 0 })
  differenceValue!: number;
}

export const InventoryCountSchema =
  SchemaFactory.createForClass(InventoryCount);

InventoryCountSchema.index({ sessionId: 1, stockItemId: 1 }, { unique: true });
