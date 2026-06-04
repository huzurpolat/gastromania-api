import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RestaurantTableDocument = HydratedDocument<RestaurantTable>;

export enum TableStatus {
  Free = 'FREE',
  OccupiedState = 'OCCUPIED',
  Ordering = 'ORDERING',
  OrderSent = 'ORDER_SENT',
  InPreparation = 'IN_PREPARATION',
  ReadyToServe = 'READY_TO_SERVE',
  Served = 'SERVED',
  InProgress = 'IN_PROGRESS',
  ReadyToPay = 'READY_TO_PAY',
  Paid = 'PAID',
  Dirty = 'DIRTY',
  ReservedState = 'RESERVED',
  Available = 'Available',
  Occupied = 'Occupied',
  Reserved = 'Reserved',
  Inactive = 'Inactive',
}

export enum TableShape {
  Round = 'round',
  Square = 'square',
  Rectangle = 'rectangle',
  Bar = 'bar',
  Vip = 'vip',
}

@Schema({ timestamps: true, versionKey: false })
export class RestaurantTable {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  regionId?: string;

  @Prop({ trim: true, index: true })
  tableNumber?: string;

  @Prop({ trim: true })
  tableName?: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, min: 1 })
  seats!: number;

  @Prop({ trim: true })
  area?: string;

  @Prop({ default: 'table_restaurant', trim: true })
  icon!: string;

  @Prop({
    type: String,
    enum: Object.values(TableStatus),
    default: TableStatus.Free,
  })
  status!: TableStatus;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ trim: true, index: true, unique: true, sparse: true })
  qrToken?: string;

  @Prop()
  qrTokenCreatedAt?: Date;

  @Prop()
  qrTokenRevokedAt?: Date;

  @Prop({ default: false, index: true })
  qrEnabled!: boolean;

  @Prop({ trim: true })
  qrMenuId?: string;

  @Prop({ min: 0, default: 0 })
  guestCount!: number;

  @Prop({ type: [String], default: [], index: true })
  activeOrderIds!: string[];

  @Prop({ min: 0, default: 0 })
  currentTotal!: number;

  @Prop()
  waitingSince?: Date;

  @Prop()
  lastStatusChange?: Date;

  @Prop({ trim: true, index: true })
  assignedWaiterId?: string;

  @Prop({ trim: true, index: true })
  reservationId?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ min: 0, max: 100 })
  planX?: number;

  @Prop({ min: 0, max: 100 })
  planY?: number;

  @Prop({ min: 6, max: 32 })
  planWidth?: number;

  @Prop({ min: 6, max: 24 })
  planHeight?: number;

  @Prop({ min: 0, max: 359, default: 0 })
  planRotation!: number;

  @Prop({ default: 'EG', trim: true, index: true })
  planFloor!: string;

  @Prop({ required: true, trim: true, index: true })
  floorId!: string;

  @Prop({ trim: true })
  floorName?: string;

  @Prop({
    type: String,
    enum: Object.values(TableShape),
    default: TableShape.Rectangle,
  })
  planShape!: TableShape;
}

export const RestaurantTableSchema =
  SchemaFactory.createForClass(RestaurantTable);

RestaurantTableSchema.index({ locationId: 1, name: 1 }, { unique: true });
RestaurantTableSchema.index({ companyId: 1, regionId: 1, locationId: 1 });
RestaurantTableSchema.index({ locationId: 1, status: 1 });
RestaurantTableSchema.index({ locationId: 1, floorId: 1 });
