import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LocationDocument = HydratedDocument<Location>;

@Schema({ _id: false })
export class LocationTablePlanArea {
  @Prop({ required: true, trim: true })
  id!: string;

  @Prop({ required: true, trim: true })
  label!: string;

  @Prop({ trim: true })
  category?: string;

  @Prop({ trim: true })
  icon?: string;

  @Prop({ default: 'EG', trim: true })
  floor!: string;

  @Prop({ required: true, min: 0, max: 100 })
  x!: number;

  @Prop({ required: true, min: 0, max: 100 })
  y!: number;

  @Prop({ required: true, min: 1, max: 100 })
  width!: number;

  @Prop({ required: true, min: 1, max: 100 })
  height!: number;

  @Prop({ trim: true })
  notes?: string;
}

export const LocationTablePlanAreaSchema = SchemaFactory.createForClass(
  LocationTablePlanArea,
);

@Schema({ _id: false })
export class LocationTablePlanObject {
  @Prop({ required: true, trim: true })
  id!: string;

  @Prop({ required: true, trim: true })
  label!: string;

  @Prop({ required: true, trim: true })
  kind!: string;

  @Prop({ required: true, trim: true })
  icon!: string;

  @Prop({ required: true, min: 0, max: 100 })
  x!: number;

  @Prop({ required: true, min: 0, max: 100 })
  y!: number;

  @Prop({ required: true, min: 1, max: 100 })
  width!: number;

  @Prop({ required: true, min: 1, max: 100 })
  height!: number;

  @Prop({ min: 0, max: 359, default: 0 })
  rotation!: number;

  @Prop({ trim: true })
  notes?: string;
}

export const LocationTablePlanObjectSchema = SchemaFactory.createForClass(
  LocationTablePlanObject,
);

@Schema({ timestamps: true, versionKey: false })
export class Location {
  _id!: string;

  @Prop({ required: true, trim: true, index: true })
  name!: string;

  @Prop({ trim: true, index: true })
  slug?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  addressLine1?: string;

  @Prop({ trim: true })
  addressLine2?: string;

  @Prop({ required: true, trim: true })
  street!: string;

  @Prop({ required: true, trim: true })
  zip!: string;

  @Prop({ trim: true })
  postalCode?: string;

  @Prop({ required: true, trim: true, index: true })
  city!: string;

  @Prop({ trim: true })
  cityName?: string;

  @Prop({ trim: true, default: 'Deutschland' })
  country?: string;

  @Prop({ trim: true, index: true })
  cityId?: string;

  @Prop({ trim: true, index: true })
  federalState?: string;

  @Prop({ default: 'storefront', trim: true })
  icon!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true, lowercase: true })
  email?: string;

  @Prop({ trim: true })
  taxNumber?: string;

  @Prop({ trim: true })
  vatId?: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ trim: true, index: true })
  areaId?: string;

  @Prop({ trim: true, index: true })
  regionId?: string;

  @Prop()
  managerId?: string;

  @Prop({ type: [String], default: ['EG'] })
  tablePlanFloors!: string[];

  @Prop({ type: Object, default: {} })
  tablePlanFloorDescriptions!: Record<string, string>;

  @Prop({ type: [LocationTablePlanAreaSchema], default: [] })
  tablePlanAreas!: LocationTablePlanArea[];

  @Prop({ type: [LocationTablePlanObjectSchema], default: [] })
  tablePlanObjects!: LocationTablePlanObject[];
}

export const LocationSchema = SchemaFactory.createForClass(Location);

LocationSchema.index({ city: 1, name: 1 });
LocationSchema.index({ federalState: 1, city: 1, name: 1 });
LocationSchema.index({ tenantId: 1, isActive: 1 });
LocationSchema.index({ tenantId: 1, areaId: 1, regionId: 1, isActive: 1 });
LocationSchema.index({ tenantId: 1, areaId: 1, regionId: 1, cityId: 1, isActive: 1 });
LocationSchema.index({ companyId: 1, regionId: 1, isActive: 1 });
