import { BadRequestException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { POS_MODULE_KEY } from '../modules/constants/module-definitions';
import { TenantStatus } from './schemas/tenant.schema';
import { TenantsService } from './tenants.service';

describe('TenantsService', () => {
  const actor: AuthenticatedUser = {
    sub: 'platform-user',
    email: 'platform@gastromania.local',
    roles: [Role.PlatformAdmin],
    permissions: ['*'],
    permissionsVersion: 1,
  };

  function createService() {
    const tenantModel = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({
        _id: { toString: () => 'tenant-1' },
        name: 'Demo Test Tenant',
        slug: 'demo-test-tenant',
        status: TenantStatus.Active,
        planKey: 'demo',
        save: jest.fn(),
      }),
    };
    const companyModel = {
      create: jest.fn().mockResolvedValue({
        _id: { toString: () => 'company-1' },
      }),
    };
    const userModel = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({
        _id: { toString: () => 'user-1' },
        email: 'admin@demo-test-tenant.demo',
        firstName: 'Demo',
        lastName: 'Admin',
        roles: [Role.TenantAdmin],
        tenantId: 'tenant-1',
        companyId: 'company-1',
        isActive: true,
        status: 'active',
      }),
    };
    const auditLogModel = {
      create: jest.fn().mockResolvedValue({}),
    };
    const modulesService = {
      findAll: jest.fn().mockResolvedValue([
        {
          key: POS_MODULE_KEY,
          systemLocked: false,
        },
      ]),
      ensureTenantDefaults: jest.fn().mockResolvedValue(undefined),
      findTenantModules: jest.fn().mockResolvedValue([
        {
          key: POS_MODULE_KEY,
          systemLocked: false,
        },
      ]),
      updateTenantModule: jest.fn().mockResolvedValue({
        key: POS_MODULE_KEY,
        enabled: true,
      }),
    };
    const service = new TenantsService(
      tenantModel as never,
      companyModel as never,
      userModel as never,
      auditLogModel as never,
      modulesService as never,
    );

    return {
      service,
      tenantModel,
      companyModel,
      userModel,
      auditLogModel,
      modulesService,
    };
  }

  it('rejects unknown start modules before creating tenant data', async () => {
    const { service, tenantModel, companyModel, userModel, auditLogModel } =
      createService();

    await expect(
      service.create(
        {
          name: 'Demo Test Tenant',
          slug: 'demo-test-tenant',
          status: TenantStatus.Active,
          planKey: 'demo',
          adminFirstName: 'Demo',
          adminLastName: 'Admin',
          adminEmail: 'admin@demo-test-tenant.demo',
          adminPassword: 'Demo2026!',
          enabledModules: ['missing_module'],
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tenantModel.exists).not.toHaveBeenCalled();
    expect(companyModel.create).not.toHaveBeenCalled();
    expect(userModel.create).not.toHaveBeenCalled();
    expect(auditLogModel.create).not.toHaveBeenCalled();
  });

  it('creates tenant, tenant admin, start modules and audit logs', async () => {
    const {
      service,
      tenantModel,
      companyModel,
      userModel,
      auditLogModel,
      modulesService,
    } = createService();

    const result = await service.create(
      {
        name: 'Demo Test Tenant',
        slug: 'demo-test-tenant',
        status: TenantStatus.Active,
        planKey: 'demo',
        adminFirstName: 'Demo',
        adminLastName: 'Admin',
        adminEmail: 'admin@demo-test-tenant.demo',
        adminPassword: 'Demo2026!',
        enabledModules: [POS_MODULE_KEY],
      },
      actor,
    );

    expect(tenantModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Demo Test Tenant',
        slug: 'demo-test-tenant',
        status: TenantStatus.Active,
        planKey: 'demo',
      }),
    );
    expect(companyModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Demo Test Tenant',
        slug: 'demo-test-tenant',
      }),
    );
    expect(userModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@demo-test-tenant.demo',
        roles: [Role.TenantAdmin],
        tenantId: 'tenant-1',
      }),
    );
    expect(modulesService.updateTenantModule).toHaveBeenCalledWith(
      'tenant-1',
      POS_MODULE_KEY,
      true,
    );
    expect(auditLogModel.create).toHaveBeenCalledTimes(2);
    expect(result.admin.email).toBe('admin@demo-test-tenant.demo');
  });
});
