import { Role } from './enums/role.enum';

const roleAliases: Record<string, Role> = {
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
  return normalizeRoles(roles).includes(role);
}

export function hasAnyRole(
  roles: string[] | undefined,
  requiredRoles: Role[],
): boolean {
  const normalizedRoles = normalizeRoles(roles);

  return requiredRoles.some((role) => normalizedRoles.includes(role));
}

export function isPlatformRole(roles: string[] | undefined): boolean {
  return hasAnyRole(roles, [Role.PlatformAdmin, Role.SuperAdmin]);
}
