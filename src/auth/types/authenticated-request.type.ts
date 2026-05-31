import { Request } from 'express';
export interface AuthenticatedUser {
  sub: string;
  email: string;
  roles: string[];
  permissions?: string[];
  companyId?: string;
  regionIds?: string[];
  locationIds?: string[];
  managedLocationIds?: string[];
  departmentIds?: string[];
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
