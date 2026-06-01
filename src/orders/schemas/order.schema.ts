import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  Draft = 'Entwurf',
  New = 'Neu',
  Accepted = 'Angenommen',
  Preparing = 'In Zubereitung',
  Ready = 'Bereit zur Ausgabe',
  Served = 'Ausgegeben',
  Closed = 'Geschlossen',
  Cancelled = 'Storniert',
}

export enum OrderItemStatus {
  Open = 'Offen',
  Preparing = 'In Zubereitung',
  Ready = 'Fertig',
  Served = 'Ausgegeben',
  Cancelled = 'Storniert',
}

export enum ProductionArea {
  Kitchen = 'Küche',
  Bar = 'Bar',
  Counter = 'Theke',
  Dessert = 'Dessert',
  Grill = 'Grill',
  Prep = 'Vorbereitung',
}

export enum OrderPriority {
  Normal = 'Normal',
  High = 'Hoch',
  Urgent = 'Eilig',
}

export enum PaymentStatus {
  Open = 'Offen',
  Paid = 'Bezahlt',
  PartiallyPaid = 'Teilbezahlt',
  Cancelled = 'Storniert',
}

export enum CourseType {
  Drink = 'Getränk',
  Starter = 'Vorspeise',
  Main = 'Hauptgericht',
  Dessert = 'Dessert',
  Other = 'Sonstiges',
}

@Schema()
export class OrderItem {
  _id?: string;

  @Prop({ trim: true, index: true })
  productId?: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, min: 1 })
  quantity!: number;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ required: true, min: 0, default: 0 })
  totalPrice?: number;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: true })
  isKitchenItem!: boolean;

  @Prop({
    type: String,
    enum: Object.values(OrderItemStatus),
    default: OrderItemStatus.Open,
    index: true,
  })
  status?: OrderItemStatus;

  @Prop({
    type: String,
    enum: Object.values(ProductionArea),
    default: ProductionArea.Kitchen,
    index: true,
  })
  productionArea?: ProductionArea;

  @Prop({
    type: String,
    enum: Object.values(CourseType),
    default: CourseType.Main,
  })
  courseType?: CourseType;

  @Prop({ type: [String], default: [] })
  specialRequests?: string[];

  @Prop({ type: [String], default: [] })
  allergens?: string[];

  @Prop({ trim: true })
  comment?: string;

  @Prop()
  changedAt?: Date;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ timestamps: true, versionKey: false })
export class Order {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  orderNumber?: string;

  @Prop({ trim: true, index: true })
  tableId?: string;

  @Prop({ trim: true, index: true })
  customerNumber?: string;

  @Prop({ trim: true, index: true })
  pickupNumber?: string;

  @Prop({ required: true, min: 1, default: 1 })
  guestCount!: number;

  @Prop({
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.New,
    index: true,
  })
  status!: OrderStatus;

  @Prop({
    type: String,
    enum: Object.values(OrderPriority),
    default: OrderPriority.Normal,
    index: true,
  })
  priority?: OrderPriority;

  @Prop({
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.Open,
  })
  paymentStatus?: PaymentStatus;

  @Prop({ type: [OrderItemSchema], default: [] })
  items!: OrderItem[];

  @Prop({ required: true, min: 0, default: 0 })
  subtotal!: number;

  @Prop({ required: true, min: 0, default: 0 })
  tax!: number;

  @Prop({ required: true, min: 0, default: 0 })
  total!: number;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  employeeId?: string;

  @Prop({ trim: true })
  employeeName?: string;

  @Prop({ trim: true, index: true })
  createdBy?: string;

  @Prop({ trim: true, index: true })
  assignedWaiterId?: string;

  @Prop({ trim: true })
  comment?: string;

  @Prop({ type: Object, default: {} })
  statusTimestamps?: Record<string, Date>;

  @Prop()
  calledAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ locationId: 1, createdAt: -1 });
OrderSchema.index({ tableId: 1, status: 1 });
OrderSchema.index({ locationId: 1, pickupNumber: 1 });
