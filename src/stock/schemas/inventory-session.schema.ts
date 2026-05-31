import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InventorySessionDocument = HydratedDocument<InventorySession>;

export enum InventorySessionStatus {
  Open = 'Offen',
  Closed = 'Abgeschlossen',
}

@Schema({ timestamps: true, versionKey: false })
export class InventorySession {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, enum: Object.values(InventorySessionStatus), default: InventorySessionStatus.Open })
  status!: InventorySessionStatus;

  @Prop({ required: true, trim: true })
  startedBy!: string;

  @Prop({ trim: true })
  completedBy?: string;

  @Prop({ required: true, default: Date.now })
  startedAt!: Date;

  @Prop()
  completedAt?: Date;

  @Prop({ trim: true })
  note?: string;
}

export const InventorySessionSchema =
  SchemaFactory.createForClass(InventorySession);

InventorySessionSchema.index({ locationId: 1, status: 1, startedAt: -1 });
