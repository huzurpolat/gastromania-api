import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RestaurantTableDocument = HydratedDocument<RestaurantTable>;

export enum TableStatus {
  Available = 'Available',
  Occupied = 'Occupied',
  Reserved = 'Reserved',
  Inactive = 'Inactive',
}

@Schema({ timestamps: true, versionKey: false })
export class RestaurantTable {
  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, min: 1 })
  seats!: number;

  @Prop({ trim: true })
  area?: string;

  @Prop({
    type: String,
    enum: Object.values(TableStatus),
    default: TableStatus.Available,
  })
  status!: TableStatus;

  @Prop({ default: true })
  isActive!: boolean;
}

export const RestaurantTableSchema =
  SchemaFactory.createForClass(RestaurantTable);

RestaurantTableSchema.index({ locationId: 1, name: 1 }, { unique: true });
