import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MenuItemDocument = HydratedDocument<MenuItem>;

@Schema({ timestamps: true, versionKey: false })
export class MenuItem {
  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ required: true, trim: true, index: true })
  category!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  ingredients?: string;

  @Prop({ trim: true })
  weight?: string;

  @Prop({ trim: true })
  imageUrl?: string;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ default: true })
  isKitchenItem!: boolean;

  @Prop({ default: false })
  isVegan!: boolean;

  @Prop({ default: false })
  containsNuts!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);

MenuItemSchema.index({ category: 1, name: 1 }, { unique: true });
