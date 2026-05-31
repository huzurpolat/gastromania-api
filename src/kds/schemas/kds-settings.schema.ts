import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CourseType, ProductionArea } from '../../orders/schemas/order.schema';

export type KdsSettingsDocument = HydratedDocument<KdsSettings>;

@Schema({ _id: false })
export class SlaSettings {
  @Prop({ default: 5, min: 1 })
  [CourseType.Drink]!: number;

  @Prop({ default: 10, min: 1 })
  [CourseType.Starter]!: number;

  @Prop({ default: 20, min: 1 })
  [CourseType.Main]!: number;

  @Prop({ default: 10, min: 1 })
  [CourseType.Dessert]!: number;

  @Prop({ default: 15, min: 1 })
  [CourseType.Other]!: number;
}

export const SlaSettingsSchema = SchemaFactory.createForClass(SlaSettings);

@Schema({ timestamps: true, versionKey: false })
export class KdsSettings {
  @Prop({ required: true, trim: true, unique: true, index: true })
  locationId!: string;

  @Prop({
    type: [String],
    enum: Object.values(ProductionArea),
    default: Object.values(ProductionArea),
  })
  productionAreas!: ProductionArea[];

  @Prop({ type: SlaSettingsSchema, default: {} })
  slaMinutes!: Record<CourseType, number>;

  @Prop({ default: true })
  automaticPickupNumbers!: boolean;

  @Prop({ default: true })
  resetPickupNumbersDaily!: boolean;

  @Prop({ default: true })
  soundOnNewOrder!: boolean;

  @Prop({ default: true })
  soundOnReady!: boolean;

  @Prop({ default: true })
  autoRefresh!: boolean;

  @Prop({
    type: [String],
    default: ['Neu', 'Angenommen', 'In Zubereitung', 'Bereit zur Ausgabe'],
  })
  visibleColumns!: string[];

  @Prop({ default: 'Alle' })
  defaultAreaFilter!: string;
}

export const KdsSettingsSchema = SchemaFactory.createForClass(KdsSettings);
