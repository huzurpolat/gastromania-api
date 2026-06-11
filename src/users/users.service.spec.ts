import bcrypt from 'bcrypt';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { UsersService } from './users.service';

describe('UsersService platform tenant users', () => {
  const tenantId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';
  const locationId = '507f1f77bcf86cd799439013';
  const platformActor = {
    sub: 'platform-user',
    email: 'platform@gastromania.local',
    roles: [Role.PlatformAdmin],
  };

  function queryResult<T>(value: T) {
    return {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    };
  }

  function createUser(overrides: Record<string, unknown> = {}) {
    const user = {
      _id: { toString: () => userId },
      email: 'tenant.admin@example.test',
      passwordHash: 'initial-hash',
      firstName: 'Tenant',
      lastName: 'Admin',
      roles: [Role.Admin],
      isActive: true,
      status: 'active',
      tenantId,
      locationId,
      locationIds: [locationId],
      lastLoginAt: new Date('2026-06-10T10:00:00.000Z'),
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
      permissionsVersion: 1,
      save: jest.fn(),
      ...overrides,
    };
    user.save.mockImplementation(async () => user);
    return user;
  }

  function createService(user = createUser()) {
    const userModel = {
      find: jest.fn().mockReturnValue(queryResult([user])),
      findById: jest.fn().mockReturnValue(queryResult(user)),
    };
    const locationModel = {
      find: jest.fn().mockReturnValue(
        queryResult([
          {
            _id: { toString: () => locationId },
            name: 'Bonn',
            city: 'Bonn',
          },
        ]),
      ),
    };
    const tenantModel = {
      findById: jest.fn().mockReturnValue(queryResult({ _id: tenantId })),
    };
    const auditLogModel = { create: jest.fn().mockResolvedValue({}) };
    const assignmentModel = {
      find: jest.fn().mockReturnValue(
        queryResult([
          {
            _id: { toString: () => 'assignment-1' },
            tenantId,
            userId,
            locationId,
            role: Role.Admin,
            isPrimary: true,
          },
        ]),
      ),
    };
    const accessPolicy = {
      isPlatformAdmin: jest.fn().mockReturnValue(true),
      isScopedLocationManager: jest.fn().mockReturnValue(false),
    };

    return {
      service: new UsersService(
        userModel as never,
        locationModel as never,
        tenantModel as never,
        auditLogModel as never,
        assignmentModel as never,
        accessPolicy as never,
      ),
      user,
      userModel,
      auditLogModel,
      accessPolicy,
    };
  }

  it('lists tenant users for platform admins without password fields', async () => {
    const { service } = createService();

    const result = await service.findPlatformTenantUsers(
      tenantId,
      platformActor,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        _id: userId,
        tenantId,
        email: 'tenant.admin@example.test',
        displayName: 'Tenant Admin',
        status: 'active',
        primaryLocation: expect.objectContaining({ name: 'Bonn' }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('blocks tenant admins from platform tenant user management', async () => {
    const { service, accessPolicy } = createService();
    accessPolicy.isPlatformAdmin.mockReturnValue(false);

    await expect(
      service.findPlatformTenantUsers(tenantId, {
        sub: 'tenant-admin',
        email: 'admin@example.test',
        roles: [Role.Admin],
        tenantId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('resets a user password hash without returning a password or hash', async () => {
    const user = createUser();
    const { service, auditLogModel } = createService(user);

    const result = await service.resetPlatformUserPassword(
      userId,
      platformActor,
    );

    expect(user.save).toHaveBeenCalled();
    expect(user.passwordHash).not.toBe('initial-hash');
    expect(await bcrypt.compare('initial-hash', user.passwordHash)).toBe(false);
    expect(result.resetRequired).toBe(true);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain(user.passwordHash);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: platformActor.sub,
        tenantId,
        action: 'platform.user.password_reset',
        entityType: 'user',
        entityId: userId,
      }),
    );
  });

  it('suspends and activates tenant users with audit logs', async () => {
    const user = createUser();
    const { service, auditLogModel } = createService(user);

    const suspended = await service.updatePlatformUserStatus(
      userId,
      'suspended',
      platformActor,
    );

    expect(suspended.status).toBe('suspended');
    expect(user.isActive).toBe(false);

    const activated = await service.updatePlatformUserStatus(
      userId,
      'active',
      platformActor,
    );

    expect(activated.status).toBe('active');
    expect(user.isActive).toBe(true);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.user.suspended' }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'platform.user.activated' }),
    );
  });
});

describe('UsersService tenant user management', () => {
  const tenantId = '507f1f77bcf86cd799439021';
  const otherTenantId = '507f1f77bcf86cd799439099';
  const userId = '507f1f77bcf86cd799439022';
  const locationId = '507f1f77bcf86cd799439023';
  const tenantActor = {
    sub: 'tenant-admin',
    email: 'admin@tenant.local',
    tenantId,
    roles: [Role.TenantAdmin],
  };

  function queryResult<T>(value: T) {
    return {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    };
  }

  function createUser(overrides: Record<string, unknown> = {}) {
    const user = {
      _id: { toString: () => userId },
      email: 'service@example.test',
      passwordHash: 'initial-hash',
      firstName: 'Service',
      lastName: 'User',
      roles: [Role.Service],
      isActive: true,
      status: 'active',
      tenantId,
      locationId,
      locationIds: [locationId],
      permissionsVersion: 1,
      save: jest.fn(),
      ...overrides,
    };
    user.save.mockImplementation(async () => user);
    return user;
  }

  function createService(user = createUser()) {
    const userModel = {
      create: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
      find: jest.fn().mockReturnValue(queryResult([user])),
      findById: jest.fn().mockReturnValue(queryResult(user)),
    };
    const locationModel = {
      find: jest.fn().mockReturnValue(
        queryResult([
          {
            _id: { toString: () => locationId },
            tenantId,
            name: 'Bonn',
          },
        ]),
      ),
    };
    const tenantModel = {
      findById: jest.fn().mockReturnValue(queryResult({ _id: tenantId })),
    };
    const auditLogModel = { create: jest.fn().mockResolvedValue({}) };
    const assignmentModel = {
      find: jest.fn().mockReturnValue(
        queryResult([
          {
            _id: { toString: () => 'assignment-tenant-1' },
            tenantId,
            userId,
            locationId,
            role: Role.Service,
            isPrimary: true,
          },
        ]),
      ),
      bulkWrite: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockReturnValue(queryResult({ deletedCount: 0 })),
    };
    const accessPolicy = {
      assertAssignableScope: jest.fn().mockResolvedValue(undefined),
      assertCanManageUser: jest.fn().mockResolvedValue(undefined),
      canAssignRole: jest
        .fn()
        .mockImplementation(
          (actor, role) =>
            ![Role.PlatformAdmin, Role.SuperAdmin].includes(role),
        ),
      isPlatformAdmin: jest.fn().mockReturnValue(false),
      isScopedLocationManager: jest.fn().mockReturnValue(false),
    };

    return {
      service: new UsersService(
        userModel as never,
        locationModel as never,
        tenantModel as never,
        auditLogModel as never,
        assignmentModel as never,
        accessPolicy as never,
      ),
      user,
      userModel,
      auditLogModel,
      accessPolicy,
    };
  }

  it('resets a tenant user password without returning password data', async () => {
    const user = createUser();
    const { service, auditLogModel } = createService(user);

    const result = await service.resetTenantUserPassword(
      userId,
      'NeuesPasswort2026!',
      tenantActor,
    );

    expect(user.save).toHaveBeenCalled();
    expect(user.passwordHash).not.toBe('initial-hash');
    expect(await bcrypt.compare('NeuesPasswort2026!', user.passwordHash)).toBe(
      true,
    );
    expect(result.resetRequired).toBe(true);
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('NeuesPasswort2026!');
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: tenantActor.sub,
        tenantId,
        action: 'tenant_user.password_reset',
        entityType: 'user',
        entityId: userId,
      }),
    );
  });

  it('deactivates and reactivates tenant users with audit logs', async () => {
    const user = createUser();
    const { service, auditLogModel } = createService(user);

    const disabled = await service.updateTenantUserStatus(
      userId,
      'disabled',
      tenantActor,
    );

    expect(disabled.status).toBe('disabled');
    expect(user.isActive).toBe(false);

    const activated = await service.updateTenantUserStatus(
      userId,
      'active',
      tenantActor,
    );

    expect(activated.status).toBe('active');
    expect(user.isActive).toBe(true);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant_user.disabled' }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant_user.activated' }),
    );
  });

  it('blocks cross-tenant tenant user changes', async () => {
    const user = createUser({ tenantId: otherTenantId });
    const { service, accessPolicy } = createService(user);
    accessPolicy.assertCanManageUser.mockRejectedValue(
      new ForbiddenException('Keine Berechtigung fuer diesen Benutzer'),
    );

    await expect(
      service.updateTenantUserStatus(userId, 'disabled', tenantActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks platform roles for tenant-created users', async () => {
    const { service } = createService();

    await expect(
      service.create(
        {
          email: 'platform-attempt@example.test',
          password: 'Demo2026!',
          firstName: 'No',
          lastName: 'Platform',
          tenantId,
          roles: [Role.PlatformAdmin],
          locationId,
          locationIds: [locationId],
        },
        undefined,
        tenantActor,
      ),
    ).rejects.toThrow();
  });
});

describe('UsersService platform tenant admin management', () => {
  const tenantId = '507f1f77bcf86cd799439031';
  const otherTenantId = '507f1f77bcf86cd799439099';
  const adminId = '507f1f77bcf86cd799439032';
  const platformActor = {
    sub: 'platform-user',
    email: 'platform@gastromania.local',
    roles: [Role.PlatformAdmin],
  };

  function queryResult<T>(value: T) {
    return {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(value),
    };
  }

  function createAdmin(overrides: Record<string, unknown> = {}) {
    const admin = {
      _id: { toString: () => adminId },
      email: 'admin@example.test',
      passwordHash: 'initial-hash',
      firstName: 'Tenant',
      lastName: 'Admin',
      phone: '+4922112345',
      roles: [Role.TenantAdmin],
      isActive: true,
      status: 'active',
      tenantId,
      locationIds: [],
      managedLocationIds: [],
      lastLoginAt: new Date('2026-06-10T10:00:00.000Z'),
      createdAt: new Date('2026-06-01T10:00:00.000Z'),
      permissionsVersion: 1,
      save: jest.fn(),
      ...overrides,
    };
    admin.save.mockImplementation(async () => admin);
    return admin;
  }

  function createService(admin = createAdmin()) {
    const userModel = {
      create: jest.fn().mockImplementation(async (payload) =>
        createAdmin({
          ...payload,
          _id: { toString: () => adminId },
          save: jest.fn(),
        }),
      ),
      exists: jest.fn().mockResolvedValue(false),
      find: jest.fn().mockReturnValue(queryResult([admin])),
      findById: jest.fn().mockReturnValue(queryResult(admin)),
    };
    const locationModel = {
      find: jest.fn().mockReturnValue(queryResult([])),
    };
    const tenantModel = {
      findById: jest.fn().mockReturnValue(queryResult({ _id: tenantId })),
    };
    const auditLogModel = { create: jest.fn().mockResolvedValue({}) };
    const assignmentModel = {
      find: jest.fn().mockReturnValue(queryResult([])),
    };
    const accessPolicy = {
      isPlatformAdmin: jest.fn().mockReturnValue(true),
      isScopedLocationManager: jest.fn().mockReturnValue(false),
    };

    return {
      service: new UsersService(
        userModel as never,
        locationModel as never,
        tenantModel as never,
        auditLogModel as never,
        assignmentModel as never,
        accessPolicy as never,
      ),
      admin,
      userModel,
      auditLogModel,
      accessPolicy,
    };
  }

  it('lists tenant admins for a tenant without password fields', async () => {
    const { service, userModel } = createService();

    const result = await service.findPlatformTenantAdmins(
      tenantId,
      platformActor,
    );

    expect(userModel.find).toHaveBeenCalledWith({
      tenantId,
      roles: { $in: [Role.TenantAdmin] },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        _id: adminId,
        email: 'admin@example.test',
        displayName: 'Tenant Admin',
        status: 'active',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('creates tenant admins with tenant scope and audit log', async () => {
    const { service, userModel, auditLogModel } = createService();

    const result = await service.createPlatformTenantAdmin(
      tenantId,
      {
        firstName: 'Neue',
        lastName: 'Admin',
        email: 'neue.admin@example.test',
        password: 'AdminPass2026!',
        phone: '+492211111',
      },
      platformActor,
    );

    expect(userModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'neue.admin@example.test',
        roles: [Role.TenantAdmin],
        tenantId,
        isActive: true,
        status: 'active',
      }),
    );
    expect(JSON.stringify(result)).not.toContain('AdminPass2026!');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant_admin.created',
        actorUserId: platformActor.sub,
        tenantId,
      }),
    );
  });

  it('updates tenant admin contact data only inside the tenant', async () => {
    const admin = createAdmin();
    const { service, auditLogModel } = createService(admin);

    const result = await service.updatePlatformTenantAdmin(
      tenantId,
      adminId,
      {
        firstName: 'Updated',
        lastName: 'Admin',
        email: 'updated.admin@example.test',
        phone: '+492222222',
      },
      platformActor,
    );

    expect(admin.save).toHaveBeenCalled();
    expect(result.email).toBe('updated.admin@example.test');
    expect(admin.roles).toEqual([Role.TenantAdmin]);
    expect(admin.tenantId).toBe(tenantId);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant_admin.updated' }),
    );
  });

  it('resets tenant admin passwords without returning password data', async () => {
    const admin = createAdmin();
    const { service, auditLogModel } = createService(admin);

    const result = await service.resetPlatformTenantAdminPassword(
      tenantId,
      adminId,
      'NeuesAdminPasswort2026!',
      platformActor,
    );

    expect(admin.save).toHaveBeenCalled();
    expect(await bcrypt.compare('NeuesAdminPasswort2026!', admin.passwordHash)).toBe(
      true,
    );
    expect(JSON.stringify(result)).not.toContain('NeuesAdminPasswort2026!');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant_admin.password_reset' }),
    );
  });

  it('deactivates and reactivates tenant admins', async () => {
    const admin = createAdmin();
    const { service, auditLogModel } = createService(admin);

    const disabled = await service.updatePlatformTenantAdminStatus(
      tenantId,
      adminId,
      'disabled',
      platformActor,
    );

    expect(disabled.status).toBe('disabled');
    expect(admin.isActive).toBe(false);

    const active = await service.updatePlatformTenantAdminStatus(
      tenantId,
      adminId,
      'active',
      platformActor,
    );

    expect(active.status).toBe('active');
    expect(admin.isActive).toBe(true);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant_admin.disabled' }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant_admin.activated' }),
    );
  });

  it('blocks tenant admins and cross-tenant users from platform admin routes', async () => {
    const { service, accessPolicy } = createService(
      createAdmin({ tenantId: otherTenantId }),
    );
    accessPolicy.isPlatformAdmin.mockReturnValue(false);

    await expect(
      service.findPlatformTenantAdmins(tenantId, {
        sub: 'tenant-admin',
        email: 'admin@tenant.local',
        tenantId,
        roles: [Role.TenantAdmin],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    accessPolicy.isPlatformAdmin.mockReturnValue(true);
    await expect(
      service.updatePlatformTenantAdminStatus(
        tenantId,
        adminId,
        'disabled',
        platformActor,
      ),
    ).rejects.toThrow('Tenant Admin nicht gefunden');
  });
});
