import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PayrollPeriodDocument = HydratedDocument<PayrollPeriod>;

export enum PayrollPeriodStatus {
  Open = 'open',
  Locked = 'locked',
}

@Schema({ timestamps: true, versionKey: false })
export class PayrollPeriod {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ trim: true, index: true })
  locationId?: string;

  @Prop({ trim: true, index: true })
  employeeId?: string;

  @Prop({ required: true, index: true })
  start!: Date;

  @Prop({ required: true, index: true })
  end!: Date;

  @Prop({
    enum: PayrollPeriodStatus,
    default: PayrollPeriodStatus.Open,
    index: true,
  })
  status!: PayrollPeriodStatus;

  @Prop()
  lockedAt?: Date;

  @Prop({ trim: true })
  lockedByUserId?: string;

  @Prop({ type: [Object], default: [] })
  employeeSnapshots!: Record<string, unknown>[];

  @Prop({ type: Object, default: {} })
  totalsSnapshot!: Record<string, unknown>;
}

export const PayrollPeriodSchema =
  SchemaFactory.createForClass(PayrollPeriod);

PayrollPeriodSchema.index(
  {
    tenantId: 1,
    locationId: 1,
    employeeId: 1,
    start: 1,
    end: 1,
  },
  { unique: true },
);
