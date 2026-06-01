import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DailyClosingDocument = HydratedDocument<DailyClosing>;

export enum DailyClosingStatus {
  Draft = 'draft',
  ReadyForReview = 'ready_for_review',
  Completed = 'completed',
  CompletedWithIssues = 'completed_with_issues',
  Locked = 'locked',
  Reopened = 'reopened',
}

@Schema({ _id: false })
export class SalesSummary {
  @Prop({ min: 0, default: 0 })
  grossSales!: number;

  @Prop({ min: 0, default: 0 })
  netSales!: number;

  @Prop({ min: 0, default: 0 })
  taxAmount!: number;

  @Prop({ min: 0, default: 0 })
  orderCount!: number;

  @Prop({ min: 0, default: 0 })
  cancelledOrderCount!: number;

  @Prop({ min: 0, default: 0 })
  discountTotal!: number;

  @Prop({ min: 0, default: 0 })
  refundTotal!: number;

  @Prop({ min: 0, default: 0 })
  tipTotal!: number;

  @Prop({ min: 0, default: 0 })
  averageOrderValue!: number;
}

export const SalesSummarySchema = SchemaFactory.createForClass(SalesSummary);

@Schema({ _id: false })
export class PaymentSummary {
  @Prop({ min: 0, default: 0 })
  cashTotal!: number;

  @Prop({ min: 0, default: 0 })
  cardTotal!: number;

  @Prop({ min: 0, default: 0 })
  onlineTotal!: number;

  @Prop({ min: 0, default: 0 })
  voucherTotal!: number;

  @Prop({ min: 0, default: 0 })
  otherTotal!: number;

  @Prop({ min: 0, default: 0 })
  expectedCash!: number;

  @Prop({ min: 0, default: 0 })
  countedCash!: number;

  @Prop({ default: 0 })
  cashDifference!: number;

  @Prop({ trim: true })
  differenceNote?: string;
}

export const PaymentSummarySchema = SchemaFactory.createForClass(PaymentSummary);

@Schema({ _id: false })
export class OrderSummary {
  @Prop({ min: 0, default: 0 })
  openOrders!: number;

  @Prop({ min: 0, default: 0 })
  unpaidOrders!: number;

  @Prop({ min: 0, default: 0 })
  cancelledOrders!: number;

  @Prop({ min: 0, default: 0 })
  completedOrders!: number;

  @Prop({ min: 0, default: 0 })
  readyButNotServed!: number;

  @Prop({ min: 0, default: 0 })
  tablesStillOccupied!: number;
}

export const OrderSummarySchema = SchemaFactory.createForClass(OrderSummary);

@Schema({ _id: false })
export class ChecklistSummary {
  @Prop({ default: false })
  openingChecklistCompleted!: boolean;

  @Prop({ default: false })
  closingChecklistCompleted!: boolean;

  @Prop({ min: 0, default: 0 })
  openChecklistItems!: number;

  @Prop({ min: 0, default: 0 })
  blockedChecklistItems!: number;
}

export const ChecklistSummarySchema =
  SchemaFactory.createForClass(ChecklistSummary);

@Schema({ _id: false })
export class InventorySummary {
  @Prop({ min: 0, default: 0 })
  lowStockItems!: number;

  @Prop({ min: 0, default: 0 })
  negativeStockItems!: number;

  @Prop({ min: 0, default: 0 })
  wasteTotal!: number;

  @Prop({ min: 0, default: 0 })
  spoilageTotal!: number;

  @Prop({ type: [String], default: [] })
  inventoryWarnings!: string[];
}

export const InventorySummarySchema =
  SchemaFactory.createForClass(InventorySummary);

@Schema({ _id: false })
export class MarginSummary {
  @Prop({ min: 0, default: 0 })
  foodCost!: number;

  @Prop({ default: 0 })
  grossMargin!: number;

  @Prop({ default: 0 })
  marginPercent!: number;

  @Prop({ min: 0, default: 0 })
  itemsBelowTargetMargin!: number;
}

export const MarginSummarySchema = SchemaFactory.createForClass(MarginSummary);

@Schema({ _id: true })
export class DailyClosingAuditEntry {
  _id?: string;

  @Prop({ required: true, trim: true })
  userId!: string;

  @Prop({ type: [String], default: [] })
  roles!: string[];

  @Prop({ required: true, trim: true })
  action!: string;

  @Prop({ trim: true })
  previousStatus?: string;

  @Prop({ trim: true })
  newStatus?: string;

  @Prop({ required: true })
  timestamp!: Date;

  @Prop({ required: true, trim: true })
  locationId!: string;

  @Prop({ trim: true })
  note?: string;
}

export const DailyClosingAuditEntrySchema =
  SchemaFactory.createForClass(DailyClosingAuditEntry);

@Schema({ _id: true })
export class DailyClosingStatusHistoryEntry {
  _id?: string;

  @Prop({ trim: true })
  previousStatus?: string;

  @Prop({ required: true, trim: true })
  newStatus!: string;

  @Prop({ required: true, trim: true })
  changedBy!: string;

  @Prop({ required: true })
  changedAt!: Date;

  @Prop({ trim: true })
  note?: string;
}

export const DailyClosingStatusHistoryEntrySchema =
  SchemaFactory.createForClass(DailyClosingStatusHistoryEntry);

@Schema({ timestamps: true, versionKey: false })
export class DailyClosing {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  regionId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, index: true })
  businessDate!: Date;

  @Prop({
    type: String,
    enum: Object.values(DailyClosingStatus),
    default: DailyClosingStatus.Draft,
    index: true,
  })
  status!: DailyClosingStatus;

  @Prop({ required: true, trim: true })
  createdBy!: string;

  @Prop({ trim: true })
  completedBy?: string;

  @Prop()
  completedAt?: Date;

  @Prop({ trim: true })
  reviewedBy?: string;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  lockedAt?: Date;

  @Prop({ trim: true })
  lockedBy?: string;

  @Prop({ trim: true })
  reopenedBy?: string;

  @Prop()
  reopenedAt?: Date;

  @Prop({ trim: true })
  note?: string;

  @Prop({ trim: true })
  issueNote?: string;

  @Prop({ type: SalesSummarySchema, default: {} })
  salesSummary!: SalesSummary;

  @Prop({ type: PaymentSummarySchema, default: {} })
  paymentSummary!: PaymentSummary;

  @Prop({ type: OrderSummarySchema, default: {} })
  orderSummary!: OrderSummary;

  @Prop({ type: ChecklistSummarySchema, default: {} })
  checklistSummary!: ChecklistSummary;

  @Prop({ type: InventorySummarySchema, default: {} })
  inventorySummary!: InventorySummary;

  @Prop({ type: MarginSummarySchema, default: {} })
  marginSummary!: MarginSummary;

  @Prop({ type: [String], default: [] })
  issueList!: string[];

  @Prop({ type: [DailyClosingAuditEntrySchema], default: [] })
  activityLog!: DailyClosingAuditEntry[];

  @Prop({ type: [DailyClosingStatusHistoryEntrySchema], default: [] })
  statusHistory!: DailyClosingStatusHistoryEntry[];
}

export const DailyClosingSchema = SchemaFactory.createForClass(DailyClosing);

DailyClosingSchema.index(
  { locationId: 1, businessDate: 1 },
  { unique: true },
);
DailyClosingSchema.index({ companyId: 1, regionId: 1, businessDate: -1 });
