import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CounterSettingsDocument = HydratedDocument<CounterSettings>;

@Schema({ timestamps: true, versionKey: false })
export class CounterSettings {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true, unique: true })
  locationId!: string;

  @Prop({ required: true, trim: true, default: 'A' })
  pickupPrefix!: string;

  @Prop({ required: true, min: 1, default: 1 })
  pickupStartNumber!: number;

  @Prop({ required: true, min: 1, default: 3 })
  pickupNumberLength!: number;

  @Prop({ default: true })
  dailyResetEnabled!: boolean;

  @Prop({ default: true })
  requirePaymentBeforeComplete!: boolean;

  @Prop({ default: false })
  receiptPrinterEnabled!: boolean;

  @Prop({ trim: true })
  receiptFooter?: string;
}

export const CounterSettingsSchema =
  SchemaFactory.createForClass(CounterSettings);
