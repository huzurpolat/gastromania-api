import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const context = (authorization = 'Bearer token') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization },
          query: {},
        }),
      }),
    }) as unknown as ExecutionContext;

  const userModel = (permissionsVersion: number, overrides = {}) =>
    ({
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              isActive: true,
              status: 'active',
              permissionsVersion,
              ...overrides,
            }),
          }),
        }),
      }),
    }) as never;

  it('allows tokens with the current permissions version', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'service@example.test',
        roles: ['WAITER'],
        permissionsVersion: 3,
      }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, userModel(3));

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('rejects outdated permission sessions', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'service@example.test',
        roles: ['WAITER'],
        permissionsVersion: 2,
      }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, userModel(3));

    await expect(guard.canActivate(context())).rejects.toThrow(
      new UnauthorizedException(
        'Session permissions are outdated. Please login again.',
      ),
    );
  });

  it('rejects disabled users even when the token is otherwise valid', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'service@example.test',
        roles: ['WAITER'],
        permissionsVersion: 1,
      }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(
      jwtService,
      userModel(1, { isActive: false }),
    );

    await expect(guard.canActivate(context())).rejects.toThrow(
      new UnauthorizedException('Benutzer ist deaktiviert'),
    );
  });

  it('rejects suspended users even when the token version matches', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'service@example.test',
        roles: ['WAITER'],
        permissionsVersion: 4,
      }),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(
      jwtService,
      userModel(4, { status: 'suspended' }),
    );

    await expect(guard.canActivate(context())).rejects.toThrow(
      new UnauthorizedException('Benutzer ist deaktiviert'),
    );
  });

  it('rejects tokens for hard-deleted users', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'deleted-user',
        email: 'deleted@example.test',
        roles: ['WAITER'],
        permissionsVersion: 1,
      }),
    } as unknown as JwtService;
    const missingUserModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(null),
          }),
        }),
      }),
    } as never;
    const guard = new JwtAuthGuard(jwtService, missingUserModel);

    await expect(guard.canActivate(context())).rejects.toThrow(
      new UnauthorizedException('Benutzer ist deaktiviert'),
    );
  });
});
