import { ConflictException } from '@nestjs/common';
import { RbacService } from './rbac.service';

describe('RbacService', () => {
  const actor = {
    sub: 'user-1',
    email: 'admin@test.local',
    roles: ['TenantAdmin'],
  };

  it('maps duplicate role names during update to a conflict response', async () => {
    const role = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      name: 'Service',
      description: 'Old',
      isActive: true,
      isSystemRole: false,
      permissions: ['roles.view'],
      toObject: jest.fn().mockReturnValue({ name: 'Service' }),
      save: jest.fn().mockRejectedValue({ code: 11000 }),
    };
    const service = new RbacService(
      {
        findById: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(role),
        }),
      } as never,
      { create: jest.fn() } as never,
      {} as never,
    );

    await expect(
      service.updateRole(
        '507f1f77bcf86cd799439011',
        { name: 'TenantAdmin' },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
