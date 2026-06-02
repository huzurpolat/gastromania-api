import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { OrderStatus } from '../../orders/schemas/order.schema';

export type CounterOrderStatusLogDocument =
  HydratedDocument<CounterOrderStatusLog>;

@Schema({ timestamps: true, versionKey: false })
export class CounterOrderStatusLog {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  orderId!: string;

  @Prop({ trim: true, index: true })
  pickupNumber?: string;

  @Prop({ type: String, enum: Object.values(OrderStatus) })
  previousStatus?: OrderStatus;

  @Prop({ type: String, enum: Object.values(OrderStatus) })
  nextStatus?: OrderStatus;

  @Prop({ required: true, trim: true, index: true })
  action!: string;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ trim: true, index: true })
  userId?: string;

  @Prop({ trim: true })
  userRole?: string;
}

export const CounterOrderStatusLogSchema =
  SchemaFactory.createForClass(CounterOrderStatusLog);

CounterOrderStatusLogSchema.index({ locationId: 1, createdAt: -1 });
