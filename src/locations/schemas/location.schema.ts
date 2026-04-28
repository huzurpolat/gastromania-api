import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LocationDocument = HydratedDocument<Location>;

@Schema({ timestamps: true, versionKey: false })
export class Location {
  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ required: true, trim: true })
  street!: string;

  @Prop({ required: true, trim: true })
  zip!: string;

  @Prop({ required: true, trim: true, index: true })
  city!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  managerId?: string;
}

export const LocationSchema = SchemaFactory.createForClass(Location);

LocationSchema.index({ city: 1, name: 1 });
