import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../auth/enums/role.enum';

export type UserDocument = HydratedDocument<User>;

export interface UserResponse {
  _id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  mobile?: string;
  taxNumber?: string;
  vatId?: string;
  taxOffice?: string;
  employeeNumber?: string;
  department?: string;
  profileImageUrl?: string;
  lastLoginAt?: Date;
  role: string;
  roles: string[];
  permissions?: string[];
  isActive: boolean;
  companyId?: string;
  regionIds?: string[];
  locationId?: string;
  locationIds?: string[];
  managedLocationIds?: string[];
  departmentIds?: string[];
  responsibilities?: string[];
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

  @Prop({ trim: true })
  employeeNumber?: string;

  @Prop({ trim: true })
  department?: string;

  @Prop({ trim: true })
  profileImageUrl?: string;

  @Prop()
  lastLoginAt?: Date;

  @Prop({
    type: [String],
    default: [Role.Service],
  })
  roles!: string[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ type: [String], default: [], index: true })
  regionIds?: string[];

  @Prop({ trim: true })
  locationId?: string;

  @Prop({ type: [String], default: [] })
  locationIds?: string[];

  @Prop({ type: [String], default: [], index: true })
  managedLocationIds?: string[];

  @Prop({ type: [String], default: [], index: true })
  departmentIds?: string[];

  @Prop({ type: [String], default: [] })
  responsibilities?: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);

export const toUserResponse = (user: UserDocument): UserResponse => {
  const roles = user.roles?.length ? user.roles : [Role.Service];
  const name =
    [user.firstName, user.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ') ||
    user.email.split('@')[0] ||
    user.email;

  return {
    _id: user._id.toString(),
    email: user.email,
    name,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    mobile: user.mobile,
    taxNumber: user.taxNumber,
    vatId: user.vatId,
    taxOffice: user.taxOffice,
    employeeNumber: user.employeeNumber,
    department: user.department,
    profileImageUrl: user.profileImageUrl,
    lastLoginAt: user.lastLoginAt,
    role: roles[0],
    roles,
    isActive: user.isActive,
    companyId: user.companyId,
    regionIds: user.regionIds,
    locationId: user.locationId,
    locationIds: user.locationIds,
    managedLocationIds: user.managedLocationIds,
    departmentIds: user.departmentIds,
    responsibilities: user.responsibilities,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};
