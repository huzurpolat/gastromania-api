import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PurchaseOrderDocument = HydratedDocument<PurchaseOrder>;

export enum PurchaseOrderStatus {
  Draft = 'Entwurf',
  Ordered = 'Bestellt',
  PartiallyReceived = 'Teilweise geliefert',
  Received = 'Geliefert',
  Cancelled = 'Storniert',
}

@Schema({ _id: true })
export class PurchaseOrderLine {
  _id?: string;

  @Prop({ required: true, trim: true })
  stockItemId!: string;

  @Prop({ required: true, trim: true })
  stockItemName!: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ required: true, trim: true })
  unit!: string;

  @Prop({ min: 0, default: 0 })
  unitPriceNet!: number;

  @Prop({ min: 0, default: 0 })
  totalNet!: number;
}

export const PurchaseOrderLineSchema =
  SchemaFactory.createForClass(PurchaseOrderLine);

@Schema({ timestamps: true, versionKey: false })
export class PurchaseOrder {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  supplierId!: string;

  @Prop({ required: true, trim: true })
  supplierName!: string;

  @Prop({ required: true, trim: true, index: true })
  orderNumber!: string;

  @Prop({
    type: String,
    enum: Object.values(PurchaseOrderStatus),
    default: PurchaseOrderStatus.Draft,
    index: true,
  })
  status!: PurchaseOrderStatus;

  @Prop({ type: [PurchaseOrderLineSchema], default: [] })
  lines!: PurchaseOrderLine[];

  @Prop({ min: 0, default: 0 })
  totalNet!: number;

  @Prop({ trim: true })
  note?: string;

  @Prop({ required: true, trim: true })
  createdBy!: string;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);

PurchaseOrderSchema.index({ locationId: 1, supplierId: 1, createdAt: -1 });
