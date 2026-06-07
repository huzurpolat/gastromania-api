import { Request } from 'express';
export interface AuthenticatedUser {
  sub: string;
  email: string;
  roles: string[];
  permissions?: string[];
  permissionsVersion?: number;
  tenantId?: string;
  companyId?: string;
  areaIds?: string[];
  regionIds?: string[];
  locationIds?: string[];
  primaryLocationId?: string;
  locationAssignments?: AuthenticatedLocationAssignment[];
  managedLocationIds?: string[];
  departmentIds?: string[];
}

export interface AuthenticatedLocationAssignment {
  locationId: string;
  role: string;
  isPrimary?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
