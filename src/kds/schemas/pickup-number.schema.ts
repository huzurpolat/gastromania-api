import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PickupNumberDocument = HydratedDocument<PickupNumber>;

@Schema({ timestamps: true, versionKey: false })
export class PickupNumber {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  businessDate!: string;

  @Prop({ required: true, min: 0, default: 0 })
  sequence!: number;
}

export const PickupNumberSchema = SchemaFactory.createForClass(PickupNumber);

PickupNumberSchema.index({ locationId: 1, businessDate: 1 }, { unique: true });
