import { Request } from 'express';
export interface AuthenticatedUser {
  sub: string;
  email: string;
  roles: string[];
  permissions?: string[];
  locationIds?: string[];
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
