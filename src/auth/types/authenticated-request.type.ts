import { Request } from 'express';
import { Role } from '../enums/role.enum';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  roles: Role[];
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
