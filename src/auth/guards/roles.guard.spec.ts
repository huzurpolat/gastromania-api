import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector);

  const context = (user: unknown, originalUrl: string) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user, originalUrl }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows platform admins on platform endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.PlatformAdmin]);

    expect(
      guard.canActivate(
        context({ roles: [Role.PlatformAdmin] }, '/api/platform/tenants'),
      ),
    ).toBe(true);
  });

  it('blocks platform admins on operative endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.PlatformAdmin]);

    expect(() =>
      guard.canActivate(
        context({ roles: [Role.PlatformAdmin] }, '/api/orders'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('blocks platform admins on operative endpoints without explicit roles metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(() =>
      guard.canActivate(
        context({ roles: [Role.PlatformAdmin] }, '/api/locations'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('keeps tenant role checks unchanged', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Filialleiter]);

    expect(
      guard.canActivate(
        context({ roles: [Role.Filialleiter] }, '/api/orders'),
      ),
    ).toBe(true);
  });

  it('allows tenant admins on legacy tenant admin role metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.CompanyAdmin]);

    expect(
      guard.canActivate(
        context({ roles: [Role.TenantAdmin] }, '/api/dashboard/overview'),
      ),
    ).toBe(true);
  });

  it('normalizes technical tenant admin role codes for tenant role checks', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.TenantAdmin]);

    expect(
      guard.canActivate(
        context({ roles: [Role.TenantAdminCode] }, '/api/employees'),
      ),
    ).toBe(true);
  });

  it('accepts legacy tenant admin users on technical tenant admin metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.TenantAdminCode]);

    expect(
      guard.canActivate(
        context({ roles: [Role.TenantAdmin] }, '/api/employees'),
      ),
    ).toBe(true);
  });

  it('allows technical waiter location roles on legacy service endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Service]);

    expect(
      guard.canActivate(
        context({ roles: [Role.Waiter] }, '/api/orders'),
      ),
    ).toBe(true);
  });

  it('does not treat STAFF as waiter/service access', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.Service]);

    expect(() =>
      guard.canActivate(
        context({ roles: [Role.Staff] }, '/api/orders'),
      ),
    ).toThrow(ForbiddenException);
  });
});
