import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { PaymentMethod, PaymentStatus } from '../../orders/schemas/order.schema';

export type CounterPaymentDocument = HydratedDocument<CounterPayment>;

@Schema({ timestamps: true, versionKey: false })
export class CounterPayment {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  orderId!: string;

  @Prop({ trim: true, index: true })
  pickupNumber?: string;

  @Prop({ required: true, min: 0 })
  amount!: number;

  @Prop({ type: String, enum: Object.values(PaymentMethod), required: true })
  method!: PaymentMethod;

  @Prop({
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.Paid,
    index: true,
  })
  status!: PaymentStatus;

  @Prop({ trim: true, index: true })
  cashierId?: string;

  @Prop()
  paidAt?: Date;

  @Prop({ trim: true })
  note?: string;
}

export const CounterPaymentSchema =
  SchemaFactory.createForClass(CounterPayment);

CounterPaymentSchema.index({ orderId: 1, createdAt: -1 });
