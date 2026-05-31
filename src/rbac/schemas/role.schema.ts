import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ManagedRoleDocument = HydratedDocument<ManagedRole>;

@Schema({ timestamps: true, versionKey: false })
export class ManagedRole {
  @Prop({ required: true, unique: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ default: false })
  isSystemRole!: boolean;

  @Prop({ type: [String], default: [] })
  permissions!: string[];
}

export const ManagedRoleSchema = SchemaFactory.createForClass(ManagedRole);
