import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../../auth/enums/role.enum';

export type UserDocument = HydratedDocument<User>;

export interface UserResponse {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  roles: Role[];
  isActive: boolean;
  locationId?: string;
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
}

export const UserSchema = SchemaFactory.createForClass(User);

export const toUserResponse = (user: UserDocument): UserResponse => ({
  _id: user._id.toString(),
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  roles: user.roles,
  isActive: user.isActive,
  locationId: user.locationId,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});
