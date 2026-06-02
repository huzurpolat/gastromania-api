import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PickupNumberSequenceDocument =
  HydratedDocument<PickupNumberSequence>;

@Schema({ timestamps: true, versionKey: false })
export class PickupNumberSequence {
  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  businessDate!: string;

  @Prop({ required: true, trim: true, default: 'A' })
  prefix!: string;

  @Prop({ required: true, min: 0, default: 0 })
  currentNumber!: number;

  @Prop({ required: true, min: 1, default: 3 })
  minLength!: number;

  @Prop({ trim: true })
  lastPickupNumber?: string;
}

export const PickupNumberSequenceSchema =
  SchemaFactory.createForClass(PickupNumberSequence);

PickupNumberSequenceSchema.index(
  { locationId: 1, businessDate: 1, prefix: 1 },
  { unique: true },
);
