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
  Started = 'Gestartet',
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
  Refunded = 'Erstattet',
}

export enum PaymentMethod {
  Cash = 'cash',
  Card = 'card',
  Online = 'online',
  Paypal = 'paypal',
  Voucher = 'voucher',
  Other = 'other',
  Mixed = 'mixed',
}

export enum OrderSource {
  Internal = 'internal',
  Qr = 'qr',
  Counter = 'counter',
}

export enum OrderTenantResolutionStatus {
  Resolved = 'resolved',
  LegacyOrphan = 'legacy_orphan',
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

  @Prop({ trim: true, index: true })
  menuItemId?: string;

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

  @Prop()
  startedAt?: Date;

  @Prop({ trim: true })
  startedBy?: string;

  @Prop()
  inPreparationAt?: Date;

  @Prop({ trim: true })
  inPreparationBy?: string;

  @Prop()
  readyAt?: Date;

  @Prop({ trim: true })
  readyBy?: string;

  @Prop()
  servedAt?: Date;

  @Prop({ trim: true })
  servedBy?: string;

  @Prop()
  cancelledAt?: Date;

  @Prop({ trim: true })
  cancelledBy?: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ timestamps: true, versionKey: false })
export class Order {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({
    type: String,
    enum: Object.values(OrderTenantResolutionStatus),
    index: true,
  })
  tenantResolutionStatus?: OrderTenantResolutionStatus;

  @Prop({ trim: true })
  tenantResolutionReason?: string;

  @Prop()
  tenantResolvedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  orderNumber?: string;

  @Prop({
    type: String,
    enum: Object.values(OrderSource),
    default: OrderSource.Internal,
    index: true,
  })
  source!: OrderSource;

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

  @Prop({
    type: String,
    enum: Object.values(PaymentMethod),
    default: PaymentMethod.Other,
    index: true,
  })
  paymentMethod?: PaymentMethod;

  @Prop({ type: [OrderItemSchema], default: [] })
  items!: OrderItem[];

  @Prop({ required: true, min: 0, default: 0 })
  subtotal!: number;

  @Prop({ required: true, min: 0, default: 0 })
  tax!: number;

  @Prop({ required: true, min: 0, default: 0 })
  total!: number;

  @Prop({ min: 0, default: 0 })
  discountTotal!: number;

  @Prop({ min: 0, default: 0 })
  refundTotal!: number;

  @Prop({ min: 0, default: 0 })
  tipTotal!: number;

  @Prop({ min: 0, default: 0 })
  cashAmount!: number;

  @Prop({ min: 0, default: 0 })
  cardAmount!: number;

  @Prop({ min: 0, default: 0 })
  onlineAmount!: number;

  @Prop({ min: 0, default: 0 })
  voucherAmount!: number;

  @Prop({ min: 0, default: 0 })
  otherAmount!: number;

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

  @Prop({ trim: true })
  guestNote?: string;

  @Prop({ trim: true })
  customerName?: string;

  @Prop({ trim: true, index: true })
  qrTokenId?: string;

  @Prop({ trim: true })
  qrUserAgent?: string;

  @Prop({ type: Object, default: {} })
  statusTimestamps?: Record<string, Date>;

  @Prop()
  calledAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  cancelledAt?: Date;

  @Prop()
  paidAt?: Date;

  @Prop({ trim: true })
  paidBy?: string;

  @Prop({ trim: true })
  completedBy?: string;

  @Prop({ trim: true })
  cancelledBy?: string;

  @Prop({ trim: true })
  cancelReason?: string;

  @Prop({ index: true })
  inventoryConsumedAt?: Date;

  @Prop({ default: false, index: true })
  inventoryDeducted!: boolean;

  @Prop({ index: true })
  inventoryDeductedAt?: Date;

  @Prop({ index: true })
  inventoryReversedAt?: Date;

  @Prop({ type: [String], default: [] })
  inventoryMovementIds!: string[];

  @Prop({ type: [String], default: [] })
  inventoryWarnings!: string[];
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ locationId: 1, createdAt: -1 });
OrderSchema.index({ tenantId: 1, locationId: 1, createdAt: -1 });
OrderSchema.index({
  tenantId: 1,
  tenantResolutionStatus: 1,
  locationId: 1,
  createdAt: -1,
});
OrderSchema.index({ tenantResolutionStatus: 1, createdAt: -1 });
OrderSchema.index({ tableId: 1, status: 1 });
OrderSchema.index({ locationId: 1, pickupNumber: 1 });
