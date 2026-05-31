import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type KdsStatusLogDocument = HydratedDocument<KdsStatusLog>;

@Schema({ timestamps: true, versionKey: false })
export class KdsStatusLog {
  @Prop({ required: true, trim: true, index: true })
  locationId!: string;

  @Prop({ required: true, trim: true, index: true })
  orderId!: string;

  @Prop({ trim: true, index: true })
  itemId?: string;

  @Prop({ required: true, trim: true, index: true })
  action!: string;

  @Prop({ trim: true })
  fromStatus?: string;

  @Prop({ trim: true })
  toStatus?: string;

  @Prop({ trim: true })
  employeeId?: string;

  @Prop({ trim: true })
  employeeName?: string;

  @Prop({ trim: true })
  comment?: string;
}

export const KdsStatusLogSchema = SchemaFactory.createForClass(KdsStatusLog);

KdsStatusLogSchema.index({ locationId: 1, createdAt: -1 });
KdsStatusLogSchema.index({ orderId: 1, createdAt: -1 });
