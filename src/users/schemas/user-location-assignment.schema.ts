import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserLocationAssignmentDocument =
  HydratedDocument<UserLocationAssignment>;

@Schema({ timestamps: true, versionKey: false })
export class UserLocationAssignment {
  _id!: string;

  @Prop({ required: true, trim: true, index: true })
  userId!: string;

  @Prop({ required: true, trim: true, index: true })
  tenantId!: string;

  @Prop({ type: String, trim: true, index: true, default: null })
  areaId?: string | null;

  @Prop({ type: String, trim: true, index: true, default: null })
  regionId?: string | null;

  @Prop({ type: String, trim: true, index: true, default: null })
  locationId?: string | null;

  @Prop({ required: true, trim: true, index: true })
  role!: string;

  @Prop({ type: Boolean, default: false })
  isPrimary?: boolean;
}

export const UserLocationAssignmentSchema = SchemaFactory.createForClass(
  UserLocationAssignment,
);

UserLocationAssignmentSchema.index({ userId: 1, areaId: 1 });
UserLocationAssignmentSchema.index({ userId: 1, regionId: 1 });
UserLocationAssignmentSchema.index({ userId: 1, locationId: 1 });
UserLocationAssignmentSchema.index(
  { tenantId: 1, userId: 1, locationId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      locationId: { $type: 'string' },
    },
  },
);
UserLocationAssignmentSchema.index({
  tenantId: 1,
  areaId: 1,
  regionId: 1,
  locationId: 1,
});
