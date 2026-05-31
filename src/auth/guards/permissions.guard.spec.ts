import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { Role } from '../enums/role.enum';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);

  const context = (user: unknown) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows super admins without explicit permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['roles.view']);

    expect(
      guard.canActivate(context({ roles: [Role.SuperAdmin], permissions: [] })),
    ).toBe(true);
  });

  it('requires all configured permissions', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['users.view', 'users.update']);

    expect(() =>
      guard.canActivate(
        context({ roles: [Role.Admin], permissions: ['users.view'] }),
      ),
    ).toThrow(ForbiddenException);
  });
});
