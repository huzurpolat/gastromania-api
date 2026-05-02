import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../auth/enums/role.enum';

export type UserDocument = HydratedDocument<User>;

export interface UserResponse {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  mobile?: string;
  taxNumber?: string;
  vatId?: string;
  taxOffice?: string;
  roles: Role[];
  isActive: boolean;
  locationId?: string;
  locationIds?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

@Schema({ timestamps: true, versionKey: false })
export class User {
  _id!: string;

  createdAt?: Date;

  updatedAt?: Date;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ trim: true })
  firstName?: string;

  @Prop({ trim: true })
  lastName?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  mobile?: string;

  @Prop({ trim: true })
  taxNumber?: string;

  @Prop({ trim: true })
  vatId?: string;

  @Prop({ trim: true })
  taxOffice?: string;

  @Prop({
    type: [String],
    enum: Object.values(Role),
    default: [Role.Service],
  })
  roles!: Role[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ trim: true })
  locationId?: string;

  @Prop({ type: [String], default: [] })
  locationIds?: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);

export const toUserResponse = (user: UserDocument): UserResponse => ({
  _id: user._id.toString(),
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  mobile: user.mobile,
  taxNumber: user.taxNumber,
  vatId: user.vatId,
  taxOffice: user.taxOffice,
  roles: user.roles,
  isActive: user.isActive,
  locationId: user.locationId,
  locationIds: user.locationIds,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
