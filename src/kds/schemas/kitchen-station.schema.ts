import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { ProductionArea } from '../../orders/schemas/order.schema';

export type KitchenStationDocument = HydratedDocument<KitchenStation>;

@Schema({ timestamps: true, versionKey: false })
export class KitchenStation {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, enum: Object.values(ProductionArea), index: true })
  area!: ProductionArea;

  @Prop({ default: true })
  isActive!: boolean;
}

export const KitchenStationSchema =
  SchemaFactory.createForClass(KitchenStation);

KitchenStationSchema.index({ locationId: 1, area: 1 });
