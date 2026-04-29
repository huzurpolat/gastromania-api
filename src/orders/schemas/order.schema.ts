import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  Open = 'Offen',
  InProgress = 'In Arbeit',
  Ready = 'Servierbereit',
  Completed = 'Abgeschlossen',
  Cancelled = 'Storniert',
}

@Schema({ _id: false })
export class OrderItem {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: true })
  isKitchenItem!: boolean;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ timestamps: true, versionKey: false })
export class Order {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  tableId!: string;

  @Prop({
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.Open,
    index: true,
  })
  status!: OrderStatus;

  @Prop({ type: [OrderItemSchema], default: [] })
  items!: OrderItem[];

  @Prop({ required: true, min: 0, default: 0 })
  total!: number;

  @Prop({ trim: true })
  notes?: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ locationId: 1, createdAt: -1 });
OrderSchema.index({ tableId: 1, status: 1 });
