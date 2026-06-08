import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { AddressInfo } from 'node:net';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import {
  AuditLog,
  AuditLogDocument,
} from '../audit-logs/schemas/audit-log.schema';
import {
  COUNTER_ORDERS_MODULE_KEY,
  KDS_MODULE_KEY,
  PAYROLL_MODULE_KEY,
  POS_MODULE_KEY,
  STAFF_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
} from '../modules/constants/module-definitions';
import {
  TenantModule,
  TenantModuleDocument,
} from '../modules/schemas/tenant-module.schema';
import { Tenant, TenantDocument } from './schemas/tenant.schema';

interface ApiResult<T> {
  status: number;
  body: T;
}

interface LoginBody {
  accessToken: string;
  user: {
    _id: string;
    email: string;
    roles?: string[];
    tenantId?: string;
    locationIds?: string[];
    permissions?: string[];
  };
}

interface TenantBody {
  _id: string;
  name: string;
  slug: string;
  status: string;
  planKey?: string;
}

interface CreateTenantBody {
  tenant: TenantBody;
  admin: {
    _id: string;
    email: string;
    roles?: string[];
    tenantId?: string;
  };
  modules: Array<{ key: string; enabled: boolean }>;
}

type ApiJson = Record<string, unknown> | Array<Record<string, unknown>>;

const platformCredentials = {
  email: 'platform@gastromania.local',
  password: 'Gastromania2026!',
};

const testTenantPayload = {
  name: 'Demo Test Tenant',
  slug: 'demo-test-tenant',
  status: 'active',
  planKey: 'demo',
  licenseStatus: 'active',
  billingStatus: 'paid',
  contactEmail: 'kontakt@demo-test-tenant.demo',
  contactPhone: '0221 5550100',
  adminFirstName: 'Demo',
  adminLastName: 'Admin',
  adminEmail: 'admin@demo-test-tenant.demo',
  adminPassword: 'Demo2026!',
  enabledModules: [
    POS_MODULE_KEY,
    KDS_MODULE_KEY,
    TABLE_ORDERS_MODULE_KEY,
    COUNTER_ORDERS_MODULE_KEY,
    STAFF_MANAGEMENT_MODULE_KEY,
    PAYROLL_MODULE_KEY,
  ],
};

async function verifyTenantOnboarding() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(0, '127.0.0.1');

  try {
    const address = app.getHttpServer().address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api`;
    const tenantModel = app.get<Model<TenantDocument>>(getModelToken(Tenant.name));
    const tenantModuleModel = app.get<Model<TenantModuleDocument>>(
      getModelToken(TenantModule.name),
    );
    const auditLogModel = app.get<Model<AuditLogDocument>>(
      getModelToken(AuditLog.name),
    );

    const platformLogin = await request<LoginBody>(
      baseUrl,
      'POST',
      '/auth/login',
      undefined,
      platformCredentials,
    );
    assertStatus(platformLogin, 201, 'Platform Admin Login');
    assert(
      platformLogin.body.user.roles?.includes('PlatformAdmin'),
      'Platform Admin Login liefert keine PlatformAdmin-Rolle',
    );
    assert(
      !platformLogin.body.user.tenantId,
      'Platform Admin darf keinen Tenant-Kontext besitzen',
    );
    const platformToken = platformLogin.body.accessToken;

    const burgerManiaBefore = await findTenantBySlug(baseUrl, platformToken, 'burgermania');
    const burgerManiaModulesBefore = burgerManiaBefore
      ? await request<Array<{ key: string; enabled: boolean }>>(
          baseUrl,
          'GET',
          `/platform/tenants/${burgerManiaBefore._id}/modules`,
          platformToken,
        )
      : undefined;
    if (burgerManiaModulesBefore) {
      assertStatus(burgerManiaModulesBefore, 200, 'BurgerMania Module vorher');
    }

    const existingTenant = await findTenantBySlug(
      baseUrl,
      platformToken,
      testTenantPayload.slug,
    );
    let tenant: TenantBody;
    let tenantCreated = false;

    if (existingTenant) {
      tenant = existingTenant;
    } else {
      const createResult = await request<CreateTenantBody>(
        baseUrl,
        'POST',
        '/platform/tenants',
        platformToken,
        testTenantPayload,
      );
      assertStatus(createResult, 201, 'Tenant-Erstellung');
      tenant = createResult.body.tenant;
      tenantCreated = true;
      assert(
        createResult.body.admin.email === testTenantPayload.adminEmail,
        'Erster Tenant Admin wurde nicht korrekt erstellt',
      );
      assert(
        createResult.body.admin.tenantId === tenant._id,
        'Tenant Admin ist nicht dem neuen Tenant zugeordnet',
      );
    }

    assert(tenant._id, 'Tenant besitzt keine tenantId');
    assert(tenant.slug === testTenantPayload.slug, 'Tenant-Slug stimmt nicht');
    assert(tenant.status === 'active', 'Tenant-Status ist nicht active');
    assert(tenant.planKey === testTenantPayload.planKey, 'Tenant-Plan stimmt nicht');

    await ensureRequiredModules(baseUrl, platformToken, tenant._id);

    const tenantsAfter = await request<TenantBody[]>(
      baseUrl,
      'GET',
      '/platform/tenants',
      platformToken,
    );
    assertStatus(tenantsAfter, 200, 'Kundenliste nach Tenant-Erstellung');
    assert(
      tenantsAfter.body.some((row) => row.slug === testTenantPayload.slug),
      'Demo Test Tenant erscheint nicht in der Kundenliste',
    );

    const adminLogin = await request<LoginBody>(
      baseUrl,
      'POST',
      '/auth/login',
      undefined,
      {
        email: testTenantPayload.adminEmail,
        password: testTenantPayload.adminPassword,
      },
    );
    assertStatus(adminLogin, 201, 'Tenant Admin Login');
    assert(
      adminLogin.body.user.tenantId === tenant._id,
      'Tenant Admin Login hat falschen Tenant-Kontext',
    );
    assert(
      adminLogin.body.user.roles?.includes('TenantAdmin'),
      'Tenant Admin Login liefert keine TenantAdmin-Rolle',
    );
    assert(
      !adminLogin.body.user.roles?.includes('PlatformAdmin'),
      'Tenant Admin darf keine PlatformAdmin-Rolle besitzen',
    );
    const tenantToken = adminLogin.body.accessToken;

    const tenantModules = await request<Array<{ key: string; enabled: boolean }>>(
      baseUrl,
      'GET',
      '/tenant/modules',
      tenantToken,
    );
    assertStatus(tenantModules, 200, 'Tenant Module fuer Tenant Admin');
    for (const moduleKey of testTenantPayload.enabledModules) {
      assert(
        tenantModules.body.some((moduleConfig) => moduleConfig.key === moduleKey && moduleConfig.enabled),
        `Tenant Admin sieht aktiviertes Modul ${moduleKey} nicht`,
      );
    }

    const tenantAreas = await request<unknown[]>(
      baseUrl,
      'GET',
      '/tenant/areas',
      tenantToken,
    );
    assertStatus(tenantAreas, 200, 'Tenant-Isolation Bereiche');
    assert(
      Array.isArray(tenantAreas.body) && tenantAreas.body.length === 0,
      'Neuer Tenant darf keine Bereiche anderer Tenants sehen',
    );

    const tenantLocations = await request<unknown[]>(
      baseUrl,
      'GET',
      '/tenant/locations',
      tenantToken,
    );
    assertStatus(tenantLocations, 200, 'Tenant-Isolation Standorte');
    assert(
      Array.isArray(tenantLocations.body) && tenantLocations.body.length === 0,
      'Neuer Tenant darf keine Standorte anderer Tenants sehen',
    );

    const platformBlocked = await request<ApiJson>(
      baseUrl,
      'GET',
      '/platform/tenants',
      tenantToken,
    );
    assert(
      platformBlocked.status === 403,
      'Tenant Admin darf keine Platform-Tenantliste laden',
    );

    await assertNegativeTenantCreationCases(baseUrl, platformToken);

    const auditTenantCreated = await auditLogModel
      .countDocuments({
        tenantId: tenant._id,
        action: 'tenant.created',
        entityType: 'tenant',
      })
      .exec();
    const auditTenantAdminCreated = await auditLogModel
      .countDocuments({
        tenantId: tenant._id,
        action: 'tenant_admin.created',
        entityType: 'user',
      })
      .exec();
    assert(auditTenantCreated > 0, 'Audit-Log tenant.created fehlt');
    assert(auditTenantAdminCreated > 0, 'Audit-Log tenant_admin.created fehlt');

    const unsafeTenantModules = await tenantModuleModel
      .countDocuments({
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: '' },
        ],
      })
      .exec();
    assert(unsafeTenantModules === 0, 'Es existieren globale Tenant-Module ohne tenantId');

    if (burgerManiaBefore && burgerManiaModulesBefore) {
      const burgerManiaModulesAfter = await request<Array<{ key: string; enabled: boolean }>>(
        baseUrl,
        'GET',
        `/platform/tenants/${burgerManiaBefore._id}/modules`,
        platformToken,
      );
      assertStatus(burgerManiaModulesAfter, 200, 'BurgerMania Module nachher');
      assert(
        JSON.stringify(sortModules(burgerManiaModulesAfter.body)) ===
          JSON.stringify(sortModules(burgerManiaModulesBefore.body)),
        'Tenant-Erstellung hat Module eines anderen Tenants veraendert',
      );
    }

    const persistedTenant = await tenantModel
      .findOne({ slug: testTenantPayload.slug })
      .lean()
      .exec();
    assert(Boolean(persistedTenant), 'Demo Test Tenant ist nicht persistent gespeichert');

    console.log(
      JSON.stringify(
        {
          tenantCreated,
          tenant: {
            id: tenant._id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
            planKey: tenant.planKey,
          },
          tenantAdminLogin: true,
          tenantAppearsInList: true,
          enabledModules: testTenantPayload.enabledModules,
          tenantIsolation: {
            areasVisible: tenantAreas.body.length,
            locationsVisible: tenantLocations.body.length,
            platformMenuBlockedForTenantAdmin: platformBlocked.status,
          },
          auditLogs: {
            tenantCreated: auditTenantCreated,
            tenantAdminCreated: auditTenantAdminCreated,
          },
          negativeTests: {
            duplicateSlug: 409,
            duplicateAdminEmail: 409,
            invalidModule: 400,
            emptyCompanyName: 400,
          },
          unsafeTenantModules,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function findTenantBySlug(
  baseUrl: string,
  token: string,
  slug: string,
): Promise<TenantBody | undefined> {
  const tenants = await request<TenantBody[]>(
    baseUrl,
    'GET',
    '/platform/tenants',
    token,
  );
  assertStatus(tenants, 200, 'Kundenliste laden');
  return tenants.body.find((tenant) => tenant.slug === slug);
}

async function ensureRequiredModules(
  baseUrl: string,
  token: string,
  tenantId: string,
): Promise<void> {
  const modules = await request<Array<{ key: string; enabled: boolean }>>(
    baseUrl,
    'GET',
    `/platform/tenants/${tenantId}/modules`,
    token,
  );
  assertStatus(modules, 200, 'Module des neuen Tenants laden');

  for (const moduleKey of testTenantPayload.enabledModules) {
    const moduleConfig = modules.body.find((row) => row.key === moduleKey);
    assert(Boolean(moduleConfig), `Modul ${moduleKey} fehlt beim neuen Tenant`);

    if (!moduleConfig?.enabled) {
      const update = await request<{ key: string; enabled: boolean }>(
        baseUrl,
        'PATCH',
        `/platform/tenants/${tenantId}/modules/${moduleKey}`,
        token,
        { enabled: true },
      );
      assertStatus(update, 200, `Modul ${moduleKey} aktivieren`);
      assert(update.body.enabled, `Modul ${moduleKey} wurde nicht aktiviert`);
    }
  }
}

async function assertNegativeTenantCreationCases(
  baseUrl: string,
  token: string,
): Promise<void> {
  const suffix = Date.now();
  const duplicateSlug = await request<ApiJson>(
    baseUrl,
    'POST',
    '/platform/tenants',
    token,
    {
      ...testTenantPayload,
      adminEmail: `duplicate-slug-${suffix}@demo-test-tenant.demo`,
    },
  );
  assertStatus(duplicateSlug, 409, 'Negativtest doppelter Slug');

  const duplicateAdminEmail = await request<ApiJson>(
    baseUrl,
    'POST',
    '/platform/tenants',
    token,
    {
      ...testTenantPayload,
      name: 'Duplicate Admin Email Tenant',
      slug: `duplicate-admin-email-${suffix}`,
    },
  );
  assertStatus(duplicateAdminEmail, 409, 'Negativtest doppelte Admin-E-Mail');

  const invalidModule = await request<ApiJson>(
    baseUrl,
    'POST',
    '/platform/tenants',
    token,
    {
      ...testTenantPayload,
      name: 'Invalid Module Tenant',
      slug: `invalid-module-${suffix}`,
      adminEmail: `invalid-module-${suffix}@demo-test-tenant.demo`,
      enabledModules: ['not_a_real_module'],
    },
  );
  assertStatus(invalidModule, 400, 'Negativtest ungueltiges Modul');

  const emptyCompanyName = await request<ApiJson>(
    baseUrl,
    'POST',
    '/platform/tenants',
    token,
    {
      ...testTenantPayload,
      name: '',
      slug: `empty-company-${suffix}`,
      adminEmail: `empty-company-${suffix}@demo-test-tenant.demo`,
    },
  );
  assertStatus(emptyCompanyName, 400, 'Negativtest leerer Firmenname');
}

async function request<T>(
  baseUrl: string,
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as T) : (undefined as T);

  return {
    status: response.status,
    body: parsed,
  };
}

function assertStatus<T>(
  result: ApiResult<T>,
  expectedStatus: number,
  label: string,
): void {
  assert(
    result.status === expectedStatus,
    `${label}: erwartet ${expectedStatus}, erhalten ${result.status} (${JSON.stringify(
      result.body,
    )})`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function sortModules(modules: Array<{ key: string; enabled: boolean }>) {
  return modules
    .map((moduleConfig) => ({
      key: moduleConfig.key,
      enabled: moduleConfig.enabled,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

void verifyTenantOnboarding();
