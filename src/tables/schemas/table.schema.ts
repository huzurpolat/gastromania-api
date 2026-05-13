import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RestaurantTableDocument = HydratedDocument<RestaurantTable>;

export enum TableStatus {
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

  @Prop({ default: 'table_restaurant', trim: true })
  icon!: string;

  @Prop({
    type: String,
    enum: Object.values(TableStatus),
    default: TableStatus.Available,
  })
  status!: TableStatus;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ min: 0, max: 100 })
  planX?: number;

  @Prop({ min: 0, max: 100 })
  planY?: number;

  @Prop({ min: 6, max: 32 })
  planWidth?: number;

  @Prop({ min: 6, max: 24 })
  planHeight?: number;

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
