import { Role } from './enums/role.enum';

const tenantAdminRoles = [
  Role.TenantAdmin,
  Role.RestaurantAdmin,
  Role.CompanyAdmin,
  Role.Admin,
];

const roleAliases: Record<string, Role> = {
  PLATFORM_ADMIN: Role.PlatformAdmin,
  TENANT_ADMIN: Role.TenantAdmin,
  COMPANY_ADMIN: Role.TenantAdmin,
  AREA_MANAGER: Role.Bereichsleiter,
  REGIONAL_MANAGER: Role.Regionalleiter,
  LOCATION_MANAGER: Role.Filialleiter,
  WAITER: Role.Service,
  KITCHEN: Role.Kueche,
  COUNTER: Role.Theke,
  CASHIER: Role.Kasse,
  INVENTORY_MANAGER: Role.Lager,
  EMPLOYEE: Role.Service,
  STAFF: Role.Service,
  Kueche: Role.Kueche,
  Tellerwaescher: Role.Tellerwaescher,
};

export function normalizeRole(role: string): string {
  return roleAliases[role] ?? role;
}

export function normalizeRoles(roles: string[] = []): string[] {
  return [...new Set(roles.map((role) => normalizeRole(role)))];
}

export function hasRole(roles: string[] | undefined, role: Role): boolean {
  return hasAnyRole(roles, [role]);
}

export function hasAnyRole(
  roles: string[] | undefined,
  requiredRoles: Role[],
): boolean {
  const normalizedRoles = normalizeRoles(roles);

  if (normalizedRoles.some((role) => tenantAdminRoles.includes(role as Role))) {
    return requiredRoles.some((role) => tenantAdminRoles.includes(role));
  }

  return requiredRoles.some((role) => normalizedRoles.includes(role));
}

export function isPlatformRole(roles: string[] | undefined): boolean {
  return hasAnyRole(roles, [Role.PlatformAdmin, Role.SuperAdmin]);
}
