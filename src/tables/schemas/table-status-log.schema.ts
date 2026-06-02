import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { TableStatus } from './table.schema';

export type TableStatusLogDocument = HydratedDocument<TableStatusLog>;

@Schema({ timestamps: true, versionKey: false })
export class TableStatusLog {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  regionId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  tableId!: string;

  @Prop({ trim: true })
  tableName?: string;

  @Prop({ type: String, enum: Object.values(TableStatus), index: true })
  previousStatus?: TableStatus;

  @Prop({
    type: String,
    enum: Object.values(TableStatus),
    required: true,
    index: true,
  })
  nextStatus!: TableStatus;

  @Prop({ trim: true, index: true })
  orderId?: string;

  @Prop({ trim: true, index: true })
  reservationId?: string;

  @Prop({ trim: true })
  userId?: string;

  @Prop({ trim: true })
  userRole?: string;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ required: true, default: Date.now, index: true })
  changedAt!: Date;
}

export const TableStatusLogSchema =
  SchemaFactory.createForClass(TableStatusLog);

TableStatusLogSchema.index({ tableId: 1, changedAt: -1 });
TableStatusLogSchema.index({ locationId: 1, changedAt: -1 });
