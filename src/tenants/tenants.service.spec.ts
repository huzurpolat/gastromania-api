import { BadRequestException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { POS_MODULE_KEY } from '../modules/constants/module-definitions';
import { BillingStatus, TenantStatus } from './schemas/tenant.schema';
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
        planKey: 'basic',
        planName: 'Basic',
        monthlyPriceCents: 9000,
        currency: 'EUR',
        save: jest.fn(),
      }),
      findById: jest.fn(),
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
          planKey: 'basic',
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
        planKey: 'basic',
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
        planKey: 'basic',
        planName: 'Basic',
        monthlyPriceCents: 9000,
        currency: 'EUR',
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

  it('updates tenant billing from central plan definitions and writes audit logs', async () => {
    const { service, tenantModel, auditLogModel } = createService();
    const tenant = {
      _id: { toString: () => 'tenant-1' },
      planKey: 'basic',
      planName: 'Basic',
      monthlyPriceCents: 9000,
      currency: 'EUR',
      billingStatus: BillingStatus.Trial,
      billingEmail: 'old@example.test',
      billingNotes: '',
      maxLocations: 1,
      maxUsers: 15,
      save: jest.fn().mockResolvedValue(undefined),
    };
    tenantModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(tenant),
    });

    const result = await service.updateBilling(
      '507f1f77bcf86cd799439011',
      {
        planKey: 'pro',
        billingStatus: BillingStatus.Active,
        billingEmail: 'rechnung@example.test',
        billingNotes: 'Jahresgespraech geplant',
      },
      actor,
    );

    expect(result.planKey).toBe('pro');
    expect(result.planName).toBe('Pro');
    expect(result.monthlyPriceCents).toBe(90000);
    expect(result.currency).toBe('EUR');
    expect(result.billingStatus).toBe(BillingStatus.Active);
    expect(result.billingEmail).toBe('rechnung@example.test');
    expect(tenant.save).toHaveBeenCalledTimes(1);
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.plan_changed',
        metadata: expect.objectContaining({
          oldValues: expect.objectContaining({ planKey: 'basic' }),
          newValues: expect.objectContaining({
            planKey: 'pro',
            monthlyPriceCents: 90000,
          }),
        }),
      }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.billing_status_changed',
      }),
    );
    expect(auditLogModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.billing_updated',
      }),
    );
  });

  it('rejects invalid billing plans before saving', async () => {
    const { service, tenantModel } = createService();
    const tenant = {
      _id: { toString: () => 'tenant-1' },
      planKey: 'basic',
      billingStatus: BillingStatus.Trial,
      save: jest.fn(),
    };
    tenantModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(tenant),
    });

    await expect(
      service.updateBilling(
        '507f1f77bcf86cd799439011',
        { planKey: 'enterprise' as never },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(tenant.save).not.toHaveBeenCalled();
  });

  it('hides billing fields from tenant self responses', async () => {
    const { service, tenantModel } = createService();
    tenantModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: 'tenant-1',
        name: 'Demo Test Tenant',
        slug: 'demo-test-tenant',
        status: TenantStatus.Active,
        planKey: 'pro',
        monthlyPriceCents: 90000,
        billingEmail: 'billing@example.test',
      }),
    });

    const result = await service.getCurrentTenant({
      ...actor,
      tenantId: '507f1f77bcf86cd799439011',
    });

    expect(result).toMatchObject({
      name: 'Demo Test Tenant',
      slug: 'demo-test-tenant',
      status: TenantStatus.Active,
    });
    expect(result).not.toHaveProperty('planKey');
    expect(result).not.toHaveProperty('monthlyPriceCents');
    expect(result).not.toHaveProperty('billingEmail');
  });
});
