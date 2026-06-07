import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SystemModuleDocument = HydratedDocument<SystemModule>;

@Schema({ collection: 'module_definitions', timestamps: true })
export class SystemModule {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, trim: true })
  category!: string;

  @Prop({ required: true, default: true })
  defaultEnabled!: boolean;

  @Prop({ required: true, default: false })
  systemLocked!: boolean;

  @Prop({ required: true, default: 0, index: true })
  sortOrder!: number;
}

export const SystemModuleSchema = SchemaFactory.createForClass(SystemModule);

SystemModuleSchema.index({ key: 1 }, { unique: true });
