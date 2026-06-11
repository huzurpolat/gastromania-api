import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { DepartmentsService } from './departments.service';

const execResult = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

const makeDepartment = (id: string, values: Record<string, unknown> = {}) => {
  const department = {
    _id: { toString: () => id },
    tenantId: 'tenant-a',
    name: 'Service',
    nameKey: 'service',
    description: undefined,
    sortOrder: 10,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    ...values,
  };
  const document = {
    ...department,
    save: jest.fn(),
  };
  document.save.mockImplementation(async () => document);
  return document;
};

describe('DepartmentsService tenant departments', () => {
  const actor = {
    sub: 'actor-1',
    roles: [Role.TenantAdmin],
    tenantId: 'tenant-a',
  } as any;

  const buildService = () => {
    const departmentModel = {
      create: jest.fn(async (payload) => makeDepartment('created', payload)),
      find: jest.fn(() => ({
        sort: jest.fn(() =>
          execResult([makeDepartment('dep-service'), makeDepartment('dep-kueche', { name: 'Kueche', nameKey: 'kueche' })]),
        ),
      })),
      findOne: jest.fn(() => ({
        select: jest.fn(() => execResult(null)),
        exec: jest.fn().mockResolvedValue(null),
      })),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(() => execResult({ acknowledged: true })),
    };
    const userModel = {
      aggregate: jest.fn(() => execResult([{ _id: 'dep-service', count: 2 }])),
    };
    const auditLogModel = {
      create: jest.fn().mockResolvedValue({}),
    };
    const accessPolicy = {
      assertCanManageLocation: jest.fn(),
      assertAssignableScope: jest.fn(),
      getScopedResourceFilter: jest.fn(),
    };
    const service = new DepartmentsService(
      departmentModel as any,
      userModel as any,
      auditLogModel as any,
      accessPolicy as any,
    );

    return { service, departmentModel, userModel, auditLogModel };
  };

  it('ensures tenant default departments and returns employee counts', async () => {
    const { service, departmentModel, userModel } = buildService();

    const departments = await service.findTenantDepartments(actor);

    expect(departmentModel.updateOne).toHaveBeenCalledTimes(7);
    expect(userModel.aggregate).toHaveBeenCalled();
    expect(departments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: 'dep-service',
          tenantId: 'tenant-a',
          name: 'Service',
          employeeCount: 2,
        }),
      ]),
    );
  });

  it('creates tenant departments and writes audit logs', async () => {
    const { service, departmentModel, auditLogModel } = buildService();

    const department = await service.createTenantDepartment(
      { name: 'Bar', description: 'Getraenke', sortOrder: 40 },
      actor,
    );

    expect(departmentModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        name: 'Bar',
        nameKey: 'bar',
        description: 'Getraenke',
        sortOrder: 40,
      }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'department.created',
        entityType: 'department',
        tenantId: 'tenant-a',
      }),
    );
    expect(department.name).toBe('Bar');
  });

  it('blocks duplicate tenant department names', async () => {
    const { service, departmentModel } = buildService();
    departmentModel.findOne.mockReturnValueOnce({
      select: jest.fn(() => execResult({ _id: 'existing' })),
      exec: jest.fn().mockResolvedValue({ _id: 'existing' }),
    });

    await expect(
      service.createTenantDepartment({ name: 'Service' }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates tenant department metadata', async () => {
    const { service, departmentModel, auditLogModel } = buildService();
    const doc = makeDepartment('dep-service');
    departmentModel.findOne.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(doc),
      select: jest.fn(() => execResult(null)),
    });

    const updated = await service.updateTenantDepartment(
      'dep-service',
      { description: 'Front of House', sortOrder: 20 },
      actor,
    );

    expect(doc.save).toHaveBeenCalled();
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'department.updated' }),
    );
    expect(updated.description).toBe('Front of House');
  });

  it('activates and deactivates tenant departments', async () => {
    const { service, departmentModel, auditLogModel } = buildService();
    const doc = makeDepartment('dep-service');
    departmentModel.findOne.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(doc),
      select: jest.fn(() => execResult(null)),
    });

    const updated = await service.updateTenantDepartmentStatus(
      'dep-service',
      { isActive: false },
      actor,
    );

    expect(updated.isActive).toBe(false);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'department.deactivated' }),
    );
  });

  it('prevents platform admins from managing operative departments', async () => {
    const { service } = buildService();

    await expect(
      service.createTenantDepartment(
        { name: 'Management' },
        {
          sub: 'platform-1',
          roles: [Role.PlatformAdmin],
          tenantId: 'tenant-a',
        } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
