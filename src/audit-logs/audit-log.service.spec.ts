import { NotFoundException } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  function buildService() {
    const auditLogModel = {
      create: jest.fn().mockResolvedValue({ _id: 'audit-1' }),
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    };

    return {
      service: new AuditLogService(auditLogModel as never),
      auditLogModel,
    };
  }

  it('writes canonical audit logs and masks sensitive fields', async () => {
    const { service, auditLogModel } = buildService();

    await service.logSuccess({
      actor: {
        sub: 'actor-1',
        email: 'admin@example.test',
        roles: ['TenantAdmin'],
      },
      tenantId: 'tenant-1',
      action: 'user.created',
      entityType: 'user',
      entityId: 'user-1',
      entityName: 'Max Mustermann',
      oldValues: { token: 'secret-token' },
      newValues: {
        email: 'max@example.test',
        password: 'Secret123!',
        profile: { refreshToken: 'refresh-secret' },
      },
      metadata: {
        resetToken: 'reset-secret',
        nested: { apiKey: 'api-secret' },
      },
    });

    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'actor-1',
        actorEmail: 'admin@example.test',
        actorRole: 'TenantAdmin',
        action: 'USER_CREATED',
        category: 'USER',
        entityType: 'user',
        entityId: 'user-1',
        entityName: 'Max Mustermann',
        success: true,
        oldValues: { token: '[MASKED]' },
        newValues: {
          email: 'max@example.test',
          password: '[MASKED]',
          profile: { refreshToken: '[MASKED]' },
        },
        metadata: {
          resetToken: '[MASKED]',
          nested: { apiKey: '[MASKED]' },
        },
      }),
    );
  });

  it('filters platform audit logs', async () => {
    const { service, auditLogModel } = buildService();

    await service.findPlatform({
      tenantId: 'tenant-1',
      userId: 'actor-1',
      action: 'user.created',
      category: 'USER',
      success: 'false',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });

    expect(auditLogModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorUserId: 'actor-1',
        action: 'USER_CREATED',
        category: 'USER',
        success: false,
        createdAt: {
          $gte: new Date('2026-06-01'),
          $lte: new Date('2026-06-30'),
        },
      }),
    );
  });

  it('rejects invalid audit ids', async () => {
    const { service } = buildService();

    await expect(service.findPlatformById('invalid')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
