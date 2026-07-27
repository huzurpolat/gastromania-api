import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CommunicationProviderDocument =
  HydratedDocument<CommunicationProvider>;

export enum CommunicationChannel {
  Email = 'EMAIL',
  Sms = 'SMS',
}

export enum CommunicationProviderKey {
  Brevo = 'BREVO',
  Sendgrid = 'SENDGRID',
  Mailchimp = 'MAILCHIMP',
  Twilio = 'TWILIO',
  Custom = 'CUSTOM',
}

@Schema({ timestamps: true, versionKey: false })
export class CommunicationProvider {
  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({
    type: String,
    enum: Object.values(CommunicationChannel),
    required: true,
    index: true,
  })
  type!: CommunicationChannel;

  @Prop({
    type: String,
    enum: Object.values(CommunicationProviderKey),
    required: true,
    index: true,
  })
  provider!: CommunicationProviderKey;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop({ type: Object, default: {} })
  config!: Record<string, unknown>;
}

export const CommunicationProviderSchema =
  SchemaFactory.createForClass(CommunicationProvider);

CommunicationProviderSchema.index({
  tenantId: 1,
  type: 1,
  provider: 1,
  active: 1,
});
