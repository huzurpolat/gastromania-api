import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type StockAlertDocument = HydratedDocument<StockAlert>;

@Schema({ timestamps: true, versionKey: false })
export class StockAlert {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  stockItemId!: string;

  @Prop({ required: true, trim: true })
  stockItemName!: string;

  @Prop({ required: true, trim: true, default: 'Mindestbestand' })
  type!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ required: true, trim: true, default: 'warning' })
  severity!: string;

  @Prop({ default: false, index: true })
  isResolved!: boolean;
}

export const StockAlertSchema = SchemaFactory.createForClass(StockAlert);

StockAlertSchema.index({ stockItemId: 1, type: 1, isResolved: 1 });
