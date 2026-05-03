import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WeeklyMenuDocument = HydratedDocument<WeeklyMenu>;

@Schema({ _id: false })
export class DailyMenu {
  @Prop({ required: true, index: true })
  date!: Date;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  menuItemId?: string;

  @Prop({ type: [String], default: [] })
  menuItemIds?: string[];

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ default: false })
  isVegetarian!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export const DailyMenuSchema = SchemaFactory.createForClass(DailyMenu);

@Schema({ timestamps: true, versionKey: false })
export class WeeklyMenu {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ required: true, index: true })
  weekStart!: Date;

  @Prop({ trim: true })
  note?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: [DailyMenuSchema], default: [] })
  days!: DailyMenu[];
}

export const WeeklyMenuSchema = SchemaFactory.createForClass(WeeklyMenu);

WeeklyMenuSchema.index({ locationId: 1, weekStart: 1 }, { unique: true });
