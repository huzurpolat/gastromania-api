import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum TenantStatus {
  Active = 'active',
  Trial = 'trial',
  Suspended = 'suspended',
  Cancelled = 'cancelled',
}

export enum LicenseStatus {
  Active = 'active',
  Trial = 'trial',
  Suspended = 'suspended',
  Expired = 'expired',
}

export enum BillingStatus {
  Paid = 'paid',
  Open = 'open',
  Overdue = 'overdue',
  Blocked = 'blocked',
}

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ collection: 'tenants', timestamps: true, versionKey: false })
export class Tenant {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  slug!: string;

  @Prop({
    required: true,
    enum: Object.values(TenantStatus),
    default: TenantStatus.Trial,
    index: true,
  })
  status!: TenantStatus;

  @Prop({ trim: true })
  planKey?: string;

  @Prop({
    required: true,
    enum: Object.values(LicenseStatus),
    default: LicenseStatus.Trial,
    index: true,
  })
  licenseStatus!: LicenseStatus;

  @Prop({
    required: true,
    enum: Object.values(BillingStatus),
    default: BillingStatus.Open,
    index: true,
  })
  billingStatus!: BillingStatus;

  @Prop()
  licenseValidUntil?: Date;

  @Prop({ trim: true, lowercase: true })
  contactEmail?: string;

  @Prop({ trim: true })
  contactPhone?: string;

  @Prop({ trim: true })
  billingName?: string;

  @Prop({ trim: true })
  billingAddress?: string;

  @Prop({ trim: true })
  companyId?: string;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);

TenantSchema.index({ slug: 1 }, { unique: true });
