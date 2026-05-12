import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AppSettingsDocument = HydratedDocument<AppSettings>;

@Schema({ timestamps: true, versionKey: false })
export class AppSettings {
  @Prop({ default: 'global', unique: true, index: true })
  key!: string;

  @Prop({ trim: true })
  customerName?: string;

  @Prop({ trim: true })
  customerNumber?: string;

  @Prop({ trim: true })
  contactEmail?: string;

  @Prop({ default: 'de-DE', trim: true })
  locale!: string;

  @Prop({ default: 'Europe/Berlin', trim: true })
  timezone!: string;

  @Prop({ default: 'EUR', trim: true })
  currency!: string;

  @Prop({ default: 'GM', trim: true })
  orderPrefix!: string;

  @Prop({ default: 19, min: 0, max: 100 })
  defaultTaxRate!: number;

  @Prop({ default: true })
  enablePushMessages!: boolean;

  @Prop({ default: true })
  allowDemoData!: boolean;

  @Prop({ default: false })
  maintenanceMode!: boolean;

  @Prop({ trim: true })
  mongoConnectionName?: string;

  @Prop({ trim: true })
  mongoHost?: string;

  @Prop({ trim: true })
  mongoDatabase?: string;

  @Prop({ trim: true })
  mongoUsername?: string;

  @Prop({ trim: true })
  mongoAuthSource?: string;

  @Prop({ trim: true })
  mongoOptions?: string;

  @Prop({ select: false })
  mongoPasswordCipher?: string;

  @Prop()
  mongoPasswordUpdatedAt?: Date;

  @Prop({ trim: true })
  note?: string;

  @Prop({ trim: true })
  updatedBy?: string;
}

export const AppSettingsSchema = SchemaFactory.createForClass(AppSettings);
