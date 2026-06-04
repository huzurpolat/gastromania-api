import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SystemModuleDocument = HydratedDocument<SystemModule>;

@Schema({ collection: 'system_modules', timestamps: true })
export class SystemModule {
  @Prop({ required: true, unique: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, trim: true })
  category!: string;

  @Prop({ required: true, default: true })
  enabled!: boolean;

  @Prop({ required: true, default: false })
  systemLocked!: boolean;
}

export const SystemModuleSchema = SchemaFactory.createForClass(SystemModule);

SystemModuleSchema.index({ key: 1 }, { unique: true });
