import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockMovementDocument = HydratedDocument<StockMovement>;

export enum StockMovementType {
  Receipt = 'Wareneingang',
  Usage = 'Verbrauch',
  Correction = 'Korrektur',
  Waste = 'Bruch/Verderb',
}

@Schema({ timestamps: true, versionKey: false })
export class StockMovement {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  stockItemId!: string;

  @Prop({ required: true, trim: true })
  stockItemName!: string;

  @Prop({ required: true, enum: Object.values(StockMovementType), index: true })
  type!: StockMovementType;

  @Prop({ required: true })
  quantityChange!: number;

  @Prop({ required: true, min: 0 })
  quantityAfter!: number;

  @Prop({ trim: true })
  note?: string;

  @Prop({ required: true, trim: true })
  actorId!: string;
}

export const StockMovementSchema =
  SchemaFactory.createForClass(StockMovement);

StockMovementSchema.index({ locationId: 1, createdAt: -1 });
StockMovementSchema.index({ stockItemId: 1, createdAt: -1 });
