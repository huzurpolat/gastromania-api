import bcrypt from 'bcrypt';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
      exists: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockReturnValue(queryResult([user])),
      findById: jest.fn().mockReturnValue(queryResult(user)),
      findByIdAndUpdate: jest.fn().mockImplementation((_id, update) => {
        Object.assign(user, update);
        return queryResult(user);
      }),
      findOne: jest.fn().mockReturnValue(queryResult(user)),
      countDocuments: jest.fn().mockReturnValue(queryResult(2)),
      deleteOne: jest.fn().mockReturnValue(queryResult({ deletedCount: 1 })),
    };
    const locationModel = {
      find: jest.fn().mockReturnValue(
        queryResult([
          {
            _id: { toString: () => locationId },
            tenantId,
            name: 'Bonn',
            city: 'Bonn',
          },
        ]),
      ),
    };
    const tenantModel = {
      find: jest.fn().mockReturnValue(
        queryResult([{ _id: { toString: () => tenantId }, name: 'BurgerMania' }]),
      ),
      findById: jest.fn().mockReturnValue(queryResult({ _id: tenantId })),
    };
    const auditLogModel = { create: jest.fn().mockResolvedValue({}) };
    const assignmentModel = {
      deleteMany: jest.fn().mockReturnValue(queryResult({ deletedCount: 1 })),
      updateOne: jest.fn().mockReturnValue(queryResult({ acknowledged: true })),
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
      tenantModel,
      auditLogModel,
      assignmentModel,
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

  it('lists platform-wide tenant users with server-side filters', async () => {
    const { service, userModel } = createService();

    const result = await service.findPlatformUsers(
      {
        tenantId,
        role: Role.Admin,
        locationId,
        status: 'active',
        search: 'admin',
      },
      platformActor,
    );

    expect(userModel.find).toHaveBeenCalledWith({
      $and: expect.arrayContaining([
        { tenantId },
        { roles: Role.Admin },
        {
          $or: [
            { locationId },
            { locationIds: locationId },
            { managedLocationIds: locationId },
          ],
        },
      ]),
    });
    expect(result[0]).toEqual(
      expect.objectContaining({
        tenantId,
        tenantName: 'BurgerMania',
        email: 'tenant.admin@example.test',
        locationNames: ['Bonn'],
      }),
    );
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('loads tenant user details for platform admins without sensitive fields', async () => {
    const user = createUser({
      department: 'Service',
      departmentIds: ['department-1'],
    });
    const { service, userModel } = createService(user);

    const result = await service.findPlatformTenantUser(
      tenantId,
      userId,
      platformActor,
    );

    expect(userModel.findOne).toHaveBeenCalledWith({ _id: userId, tenantId });
    expect(result).toEqual(
      expect.objectContaining({
        _id: userId,
        tenantId,
        email: 'tenant.admin@example.test',
        department: 'Service',
        departmentIds: ['department-1'],
      }),
    );
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('passwordhash');
    expect(serialized).not.toContain('refreshtoken');
    expect(serialized).not.toContain('resettoken');
    expect(serialized).not.toContain('secret');
  });

  it('loads platform user details even when the referenced tenant is missing', async () => {
    const user = createUser({ roles: [Role.Kueche] });
    const { service, tenantModel } = createService(user);
    tenantModel.find.mockReturnValueOnce(queryResult([]));
    tenantModel.findById.mockReturnValueOnce(queryResult(null));

    const result = await service.findPlatformUser(userId, platformActor);

    expect(result).toEqual(
      expect.objectContaining({
        _id: userId,
        tenantId,
        email: 'tenant.admin@example.test',
      }),
    );
    expect(result.tenantName).toBeUndefined();
  });

  it('returns not found for cross-tenant platform tenant user details', async () => {
    const { service, userModel } = createService();
    userModel.findOne.mockReturnValueOnce(queryResult(null));

    await expect(
      service.findPlatformTenantUser(tenantId, userId, platformActor),
    ).rejects.toThrow('Benutzer nicht gefunden');
  });

  it('updates tenant user details without accepting sensitive fields', async () => {
    const user = createUser({
      departmentIds: ['old-department'],
    });
    const { service, auditLogModel, assignmentModel, userModel } = createService(user);

    const result = await service.updatePlatformTenantUser(
      tenantId,
      userId,
      {
        name: 'Max Muster',
        email: 'max.muster@example.test',
        role: Role.Service,
        status: 'active',
        departmentId: 'department-1',
        locationAssignments: [
          { locationId, role: Role.Waiter, isPrimary: true },
        ],
      },
      platformActor,
    );

    expect(userModel.exists).toHaveBeenCalledWith({
      _id: { $ne: userId },
      email: 'max.muster@example.test',
    });
    expect(user.firstName).toBe('Max');
    expect(user.lastName).toBe('Muster');
    expect(user.email).toBe('max.muster@example.test');
    expect(user.roles).toEqual([Role.Service]);
    expect(user.departmentIds).toEqual(['department-1']);
    expect(user.locationIds).toEqual([locationId]);
    expect(user.locationId).toBe(locationId);
    expect(user.permissionsVersion).toBe(2);
    expect(user.save).toHaveBeenCalled();
    expect(assignmentModel.deleteMany).toHaveBeenCalledWith({ userId });
    expect(assignmentModel.updateOne).toHaveBeenCalledWith(
      { userId, locationId },
      expect.objectContaining({
        $set: expect.objectContaining({
          tenantId,
          locationId,
          role: Role.Waiter,
          isPrimary: true,
        }),
      }),
      { upsert: true },
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: platformActor.sub,
        tenantId,
        action: 'USER_UPDATED',
        entityType: 'user',
        entityId: userId,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        email: 'max.muster@example.test',
        displayName: 'Max Muster',
        departmentIds: ['department-1'],
      }),
    );
    const serialized = JSON.stringify(result).toLowerCase();
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('secret');
  });

  it('rejects sensitive fields in platform tenant user update payloads', async () => {
    const { service } = createService();

    await expect(
      service.updatePlatformTenantUser(
        tenantId,
        userId,
        { name: 'Unsafe User', passwordHash: 'leak' } as never,
        platformActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks platform roles in tenant user updates', async () => {
    const { service } = createService();

    await expect(
      service.updatePlatformTenantUser(
        tenantId,
        userId,
        { role: Role.PlatformAdminCode },
        platformActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permanently deletes tenant users for platform admins with audit log', async () => {
    const user = createUser({ roles: [Role.Service] });
    const { service, userModel, assignmentModel, auditLogModel } =
      createService(user);

    const result = await service.deletePlatformTenantUser(
      tenantId,
      userId,
      platformActor,
    );

    expect(result).toEqual({ deleted: true, userId });
    expect(assignmentModel.deleteMany).toHaveBeenCalledWith({ userId });
    expect(userModel.deleteOne).toHaveBeenCalledWith({ _id: userId, tenantId });
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: platformActor.sub,
        tenantId,
        action: 'USER_DELETED',
        entityType: 'user',
        entityId: userId,
        metadata: expect.objectContaining({
          targetUserId: userId,
          email: user.email,
          removedLocationAssignments: true,
          sessionsInvalidated: true,
        }),
      }),
    );
  });

  it('permanently deletes platform users even when the referenced tenant is missing', async () => {
    const user = createUser({ roles: [Role.Kueche] });
    const { service, userModel, tenantModel, assignmentModel, auditLogModel } =
      createService(user);
    tenantModel.findById.mockReturnValueOnce(queryResult(null));

    const result = await service.deletePlatformUser(userId, platformActor);

    expect(result).toEqual({ deleted: true, userId });
    expect(tenantModel.findById).not.toHaveBeenCalled();
    expect(assignmentModel.deleteMany).toHaveBeenCalledWith({ userId });
    expect(userModel.deleteOne).toHaveBeenCalledWith({ _id: userId, tenantId });
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: platformActor.sub,
        tenantId,
        action: 'USER_DELETED',
        entityType: 'user',
        entityId: userId,
      }),
    );
  });

  it('blocks platform hard delete for the current user', async () => {
    const selfActor = { ...platformActor, sub: userId };
    const { service } = createService(createUser({ roles: [Role.Service] }));

    await expect(
      service.deletePlatformTenantUser(tenantId, userId, selfActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks platform hard delete for system users', async () => {
    const { service } = createService(
      createUser({ roles: [Role.Service], isSystem: true }),
    );

    await expect(
      service.deletePlatformTenantUser(tenantId, userId, platformActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks platform hard delete for the last tenant admin', async () => {
    const { service, userModel } = createService(
      createUser({ roles: [Role.TenantAdmin] }),
    );
    userModel.countDocuments.mockReturnValueOnce(queryResult(1));

    await expect(
      service.deletePlatformTenantUser(tenantId, userId, platformActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
        action: 'PASSWORD_RESET',
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
      expect.objectContaining({ action: 'ACCOUNT_LOCKED' }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_ENABLED' }),
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
      create: jest.fn().mockImplementation(async (payload) =>
        createUser({
          ...payload,
          _id: { toString: () => userId },
          save: jest.fn(),
        }),
      ),
      exists: jest.fn().mockResolvedValue(false),
      find: jest.fn().mockReturnValue(queryResult([user])),
      findById: jest.fn().mockReturnValue(queryResult(user)),
      findByIdAndUpdate: jest.fn().mockImplementation((_id, update) => {
        Object.assign(user, update);
        return queryResult(user);
      }),
      findOne: jest.fn().mockReturnValue(queryResult(user)),
      countDocuments: jest.fn().mockReturnValue(queryResult(2)),
      deleteOne: jest.fn().mockReturnValue(queryResult({ deletedCount: 1 })),
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
      updateOne: jest.fn().mockReturnValue(queryResult({ acknowledged: true })),
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
      assignmentModel,
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
        action: 'PASSWORD_RESET',
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
      expect.objectContaining({ action: 'USER_DISABLED' }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_ENABLED' }),
    );
  });

  it('allows tenant admins to update their own profile without changing their role', async () => {
    const user = createUser({
      _id: { toString: () => userId },
      roles: [Role.TenantAdmin],
      firstName: 'Alter',
      lastName: 'Name',
    });
    const { service, userModel } = createService(user);

    const result = await service.update(
      userId,
      {
        firstName: 'Neuer',
        lastName: 'Name',
        roles: [Role.TenantAdmin],
      },
      { ...tenantActor, sub: userId },
    );

    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        firstName: 'Neuer',
        lastName: 'Name',
      }),
      { returnDocument: 'after' },
    );
    expect(result.firstName).toBe('Neuer');
    expect(result.roles).toEqual([Role.TenantAdmin]);
  });

  it('blocks tenant admins from changing their own tenant admin role', async () => {
    const user = createUser({
      _id: { toString: () => userId },
      roles: [Role.TenantAdmin],
    });
    const { service } = createService(user);

    await expect(
      service.update(
        userId,
        { roles: [Role.Service] },
        { ...tenantActor, sub: userId },
      ),
    ).rejects.toThrow(
      'Tenant Admin Rollen duerfen durch Tenant Admins nicht geaendert werden',
    );
  });

  it('soft deletes tenant users by disabling login and writing an audit log', async () => {
    const user = createUser();
    const { service, auditLogModel } = createService(user);

    const result = await service.softDeleteTenantUser(userId, tenantActor);

    expect(result.status).toBe('disabled');
    expect(user.isActive).toBe(false);
    expect(user.save).toHaveBeenCalled();
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_DISABLED',
        entityType: 'user',
        entityId: userId,
        tenantId,
        metadata: expect.objectContaining({
          targetUserId: userId,
          newValues: { status: 'disabled', isActive: false },
        }),
      }),
    );
  });

  it('blocks tenant admins from soft deleting their own account', async () => {
    const selfActor = { ...tenantActor, sub: userId };
    const user = createUser({
      _id: { toString: () => userId },
      roles: [Role.TenantAdmin],
    });
    const { service } = createService(user);

    await expect(
      service.softDeleteTenantUser(userId, selfActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks soft deleting the last active tenant admin', async () => {
    const user = createUser({ roles: [Role.TenantAdmin] });
    const { service, userModel } = createService(user);
    userModel.countDocuments.mockReturnValueOnce(queryResult(1));

    await expect(
      service.softDeleteTenantUser(userId, tenantActor),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permanently deletes tenant users in the own tenant with audit log', async () => {
    const user = createUser({ roles: [Role.Service] });
    const { service, userModel, assignmentModel, auditLogModel } =
      createService(user);

    const result = await service.deleteTenantUserPermanently(userId, tenantActor);

    expect(result).toEqual({ deleted: true, userId });
    expect(userModel.findById).toHaveBeenCalledWith(userId);
    expect(assignmentModel.deleteMany).toHaveBeenCalledWith({ userId });
    expect(userModel.deleteOne).toHaveBeenCalledWith({ _id: userId, tenantId });
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: tenantActor.sub,
        actorEmail: tenantActor.email,
        actorRole: Role.TenantAdmin,
        tenantId,
        action: 'USER_DELETED',
        category: 'USER',
        entityType: 'user',
        entityId: userId,
        metadata: expect.objectContaining({
          deletedUserId: userId,
          deletedUserEmail: user.email,
          removedLocationAssignments: true,
          sessionsInvalidated: true,
        }),
      }),
    );
  });

  it('blocks tenant admins from permanently deleting users in other tenants', async () => {
    const { service, auditLogModel } = createService(
      createUser({ tenantId: otherTenantId }),
    );

    await expect(
      service.deleteTenantUserPermanently(userId, tenantActor),
    ).rejects.toThrow('Sie duerfen nur Benutzer Ihres eigenen Tenants loeschen.');
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: tenantActor.sub,
        action: 'CROSS_TENANT_DELETE_BLOCKED',
        category: 'USER',
        entityType: 'user',
        entityId: userId,
        tenantId,
        success: false,
        metadata: expect.objectContaining({
          actorTenantId: tenantId,
          targetTenantId: otherTenantId,
          reason: 'CROSS_TENANT_DELETE_BLOCKED',
        }),
      }),
    );
  });

  it('blocks tenant admins from permanently deleting themselves', async () => {
    const user = createUser({ _id: { toString: () => userId } });
    const { service } = createService(user);

    await expect(
      service.deleteTenantUserPermanently(userId, { ...tenantActor, sub: userId }),
    ).rejects.toThrow('Sie koennen sich nicht selbst loeschen.');
  });

  it('blocks tenant admins from permanently deleting the last tenant admin', async () => {
    const user = createUser({ roles: [Role.TenantAdmin] });
    const { service, userModel } = createService(user);
    userModel.countDocuments.mockReturnValueOnce(queryResult(1));

    await expect(
      service.deleteTenantUserPermanently(userId, tenantActor),
    ).rejects.toThrow('Der letzte Tenant Admin kann nicht geloescht werden.');
  });

  it('blocks tenant admins from permanently deleting platform admins', async () => {
    const user = createUser({ roles: [Role.PlatformAdmin] });
    const { service } = createService(user);

    await expect(
      service.deleteTenantUserPermanently(userId, tenantActor),
    ).rejects.toThrow(
      'Platform Admins koennen nicht durch Tenant Admins geloescht werden.',
    );
  });

  it('blocks tenant admins from permanently deleting system users', async () => {
    const user = createUser({ roles: [Role.Service], isSystem: true });
    const { service } = createService(user);

    await expect(
      service.deleteTenantUserPermanently(userId, tenantActor),
    ).rejects.toThrow('Systembenutzer koennen nicht geloescht werden.');
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

  it('allows tenant admins to create operative users in their own tenant', async () => {
    const { service, userModel, auditLogModel } = createService();

    const result = await service.create(
      {
        email: 'service-new@example.test',
        password: 'Demo2026!',
        firstName: 'Service',
        lastName: 'Neu',
        tenantId,
        roles: [Role.Service],
        locationId,
        locationIds: [locationId],
        locationAssignments: [
          { locationId, role: Role.Service, isPrimary: true },
        ],
      },
      undefined,
      tenantActor,
    );

    expect(userModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'service-new@example.test',
        tenantId,
        roles: [Role.Service],
        locationIds: [locationId],
      }),
    );
    expect(result.email).toBe('service-new@example.test');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'USER_CREATED',
        tenantId,
      }),
    );
  });

  it('blocks tenant admins from creating tenant admins or area managers', async () => {
    const { service } = createService();

    await expect(
      service.create(
        {
          email: 'tenant-admin-attempt@example.test',
          password: 'Demo2026!',
          firstName: 'No',
          lastName: 'Admin',
          tenantId,
          roles: [Role.TenantAdmin],
          locationId,
          locationIds: [locationId],
        },
        undefined,
        tenantActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.create(
        {
          email: 'area-attempt@example.test',
          password: 'Demo2026!',
          firstName: 'No',
          lastName: 'Area',
          tenantId,
          roles: [Role.Bereichsleiter],
          locationId,
          locationIds: [locationId],
        },
        undefined,
        tenantActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
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
        action: 'USER_CREATED',
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
      expect.objectContaining({ action: 'USER_UPDATED' }),
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
      expect.objectContaining({ action: 'PASSWORD_RESET' }),
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
      expect.objectContaining({ action: 'USER_DISABLED' }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'USER_ENABLED' }),
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
