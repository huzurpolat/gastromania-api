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
  address?: string;
  street?: string;
  zip?: string;
  city?: string;
  country?: string;
  birthDate?: Date;
  hireDate?: Date;
  terminationDate?: Date;
  department?: string;
  qualifications?: string[];
  employmentType?: string;
  contractType?: string;
  weeklyHours?: number;
  hourlyRate?: number;
  monthlySalary?: number;
  vacationDaysPerYear?: number;
  remainingVacationDays?: number;
  employeeStatus?: string;
  notes?: string;
  profileImageUrl?: string;
  lastLoginAt?: Date;
  role: string;
  roles: string[];
  permissions?: string[];
  permissionsVersion?: number;
  isActive: boolean;
  status?: string;
  tenantId?: string;
  companyId?: string;
  areaIds?: string[];
  regionIds?: string[];
  locationId?: string;
  locationIds?: string[];
  locationAssignments?: UserLocationAssignmentResponse[];
  managedLocationIds?: string[];
  departmentId?: string;
  departmentIds?: string[];
  responsibilities?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserLocationAssignmentResponse {
  _id: string;
  tenantId: string;
  userId: string;
  locationId: string;
  role: string;
  isPrimary: boolean;
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
  address?: string;

  @Prop({ trim: true })
  street?: string;

  @Prop({ trim: true })
  zip?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true, default: 'Deutschland' })
  country?: string;

  @Prop()
  birthDate?: Date;

  @Prop()
  hireDate?: Date;

  @Prop()
  terminationDate?: Date;

  @Prop({ trim: true })
  department?: string;

  @Prop({ type: [String], default: [], index: true })
  qualifications?: string[];

  @Prop({ trim: true, index: true })
  employmentType?: string;

  @Prop({ trim: true, index: true })
  contractType?: string;

  @Prop({ min: 0 })
  weeklyHours?: number;

  @Prop({ min: 0 })
  hourlyRate?: number;

  @Prop({ min: 0 })
  monthlySalary?: number;

  @Prop({ min: 0 })
  vacationDaysPerYear?: number;

  @Prop({ min: 0 })
  remainingVacationDays?: number;

  @Prop({ trim: true, index: true })
  employeeStatus?: string;

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  profileImageUrl?: string;

  @Prop()
  lastLoginAt?: Date;

  @Prop({ type: Number, default: 1, min: 1 })
  permissionsVersion?: number;

  @Prop({
    type: [String],
    default: [Role.Service],
  })
  roles!: string[];

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ trim: true, index: true, default: 'active' })
  status?: string;

  @Prop({ trim: true, index: true })
  tenantId?: string;

  @Prop({ trim: true, index: true })
  companyId?: string;

  @Prop({ type: [String], default: [], index: true })
  areaIds?: string[];

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
    address: user.address,
    street: user.street,
    zip: user.zip,
    city: user.city,
    country: user.country,
    birthDate: user.birthDate,
    hireDate: user.hireDate,
    terminationDate: user.terminationDate,
    department: user.department,
    qualifications: user.qualifications ?? [],
    employmentType: user.employmentType,
    contractType: user.contractType,
    weeklyHours: user.weeklyHours,
    hourlyRate: user.hourlyRate,
    monthlySalary: user.monthlySalary,
    vacationDaysPerYear: user.vacationDaysPerYear,
    remainingVacationDays: user.remainingVacationDays,
    employeeStatus: user.employeeStatus,
    notes: user.notes,
    profileImageUrl: user.profileImageUrl,
    lastLoginAt: user.lastLoginAt,
    role: roles[0],
    roles,
    permissionsVersion: Math.max(user.permissionsVersion ?? 1, 1),
    isActive: user.isActive,
    status: user.status ?? (user.isActive ? 'active' : 'disabled'),
    tenantId: user.tenantId,
    companyId: user.companyId,
    areaIds: user.areaIds,
    regionIds: user.regionIds,
    locationId: user.locationId,
    locationIds: user.locationIds,
    managedLocationIds: user.managedLocationIds,
    departmentId: user.departmentIds?.[0],
    departmentIds: user.departmentIds,
    responsibilities: user.responsibilities,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};
