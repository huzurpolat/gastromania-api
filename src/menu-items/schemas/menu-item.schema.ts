import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MenuItemDocument = HydratedDocument<MenuItem>;

@Schema({ _id: false, versionKey: false })
export class MenuItemExtra {
  @Prop({ required: true, trim: true })
  id!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: 0 })
  priceDelta!: number;

  @Prop({ default: true })
  isAvailable!: boolean;

  @Prop({ default: true })
  sendToKitchen!: boolean;

  @Prop({ min: 0, default: 999 })
  sortOrder?: number;
}

export const MenuItemExtraSchema = SchemaFactory.createForClass(MenuItemExtra);

@Schema({ timestamps: true, versionKey: false })
export class MenuItem {
  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ required: true, trim: true, index: true })
  category!: string;

  @Prop({ trim: true })
  color?: string;

  @Prop({ trim: true })
  icon?: string;

  @Prop({ trim: true })
  backgroundColor?: string;

  @Prop({ trim: true })
  textColor?: string;

  @Prop({ min: 0, default: 999 })
  sortOrder?: number;

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

  @Prop({ min: 0 })
  sellingPrice?: number;

  @Prop({ trim: true, index: true })
  recipeId?: string;

  @Prop({ min: 0, max: 100 })
  targetMargin?: number;

  @Prop({ default: true })
  isKitchenItem!: boolean;

  @Prop({ default: false })
  isVegan!: boolean;

  @Prop({ default: false })
  containsNuts!: boolean;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: [MenuItemExtraSchema], default: [] })
  extras!: MenuItemExtra[];
}

export const MenuItemSchema = SchemaFactory.createForClass(MenuItem);

MenuItemSchema.index({ category: 1, name: 1 }, { unique: true });
