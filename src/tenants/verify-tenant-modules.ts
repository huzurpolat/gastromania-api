import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AddressInfo } from 'node:net';
import { AppModule } from '../app.module';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import {
  COST_OF_GOODS_MODULE_KEY,
  COUNTER_ORDERS_MODULE_KEY,
  DAILY_CLOSING_MODULE_KEY,
  DIGITAL_MENU_MODULE_KEY,
  INVENTORY_MODULE_KEY,
  KDS_MODULE_KEY,
  PAYROLL_MODULE_KEY,
  POS_MODULE_KEY,
  QR_ORDERS_MODULE_KEY,
  RECIPES_MODULE_KEY,
  REPORTING_MODULE_KEY,
  STAFF_MANAGEMENT_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
  TIME_TRACKING_MODULE_KEY,
} from '../modules/constants/module-definitions';
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
  };
}

interface TenantBody {
  _id: string;
  name: string;
  slug: string;
}

interface TenantModuleBody {
  key: string;
  name: string;
  enabled: boolean;
  systemLocked: boolean;
}

interface ModuleProbe {
  moduleKey: string;
  path?: string;
  method?: string;
}

type ApiJson = Record<string, unknown> | Array<Record<string, unknown>>;

const platformCredentials = {
  email: 'platform@gastromania.local',
  password: 'Gastromania2026!',
};

const tenantCredentials = {
  frittenwerk: {
    email: 'admin@frittenwerk-demo.demo',
    password: 'Demo2026!',
  },
  burgermania: {
    email: 'admin@burgermania.demo',
    password: 'Demo2026!',
  },
  demoTestTenant: {
    email: 'admin@demo-test-tenant.demo',
    password: 'Demo2026!',
  },
};

const requiredTenantSlugs = [
  'frittenwerk-demo',
  'burgermania',
  'demo-test-tenant',
];

const requiredModuleKeys = [
  POS_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  COUNTER_ORDERS_MODULE_KEY,
  KDS_MODULE_KEY,
  QR_ORDERS_MODULE_KEY,
  DIGITAL_MENU_MODULE_KEY,
  INVENTORY_MODULE_KEY,
  RECIPES_MODULE_KEY,
  COST_OF_GOODS_MODULE_KEY,
  DAILY_CLOSING_MODULE_KEY,
  STAFF_MANAGEMENT_MODULE_KEY,
  TIME_TRACKING_MODULE_KEY,
  PAYROLL_MODULE_KEY,
  REPORTING_MODULE_KEY,
];

const moduleProbes: ModuleProbe[] = [
  {
    moduleKey: POS_MODULE_KEY,
    path: '/counter/dashboard?locationId=:locationId',
  },
  {
    moduleKey: TABLE_ORDERS_MODULE_KEY,
    path: '/orders?locationId=:locationId',
  },
  {
    moduleKey: TABLE_MANAGEMENT_MODULE_KEY,
    path: '/tables?locationId=:locationId',
  },
  {
    moduleKey: COUNTER_ORDERS_MODULE_KEY,
    path: '/counter/orders?locationId=:locationId',
  },
  {
    moduleKey: KDS_MODULE_KEY,
    path: '/kds/orders?locationId=:locationId',
  },
  {
    moduleKey: DIGITAL_MENU_MODULE_KEY,
    path: '/menu-items',
  },
  {
    moduleKey: INVENTORY_MODULE_KEY,
    path: '/stock?locationId=:locationId',
  },
  {
    moduleKey: RECIPES_MODULE_KEY,
    path: '/recipes',
  },
  {
    moduleKey: COST_OF_GOODS_MODULE_KEY,
    path: '/reports/margins?locationId=:locationId',
  },
  {
    moduleKey: DAILY_CLOSING_MODULE_KEY,
    path: '/daily-closings?locationId=:locationId',
  },
  {
    moduleKey: STAFF_MANAGEMENT_MODULE_KEY,
    path: '/employees',
  },
  {
    moduleKey: TIME_TRACKING_MODULE_KEY,
    path: '/time-tracking/me?locationId=:locationId',
  },
  {
    moduleKey: PAYROLL_MODULE_KEY,
    path: '/payroll/summary',
  },
];

async function verifyTenantModules() {
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
    const locationModel = app.get<Model<LocationDocument>>(
      getModelToken(Location.name),
    );

    const platformLogin = await login(baseUrl, platformCredentials);
    assert(
      platformLogin.body.user.roles?.includes('PlatformAdmin'),
      'Platform Login liefert keine PlatformAdmin-Rolle',
    );
    assert(
      !platformLogin.body.user.tenantId,
      'Platform Admin darf keinen Tenant-Kontext besitzen',
    );
    const platformToken = platformLogin.body.accessToken;

    const tenants = await loadRequiredTenants(baseUrl, platformToken);
    const frittenwerk = tenants.get('frittenwerk-demo');
    const burgermania = tenants.get('burgermania');
    const demoTestTenant = tenants.get('demo-test-tenant');
    assert(frittenwerk, 'Frittenwerk Demo Tenant fehlt');
    assert(burgermania, 'BurgerMania Tenant fehlt');
    assert(demoTestTenant, 'Demo Test Tenant fehlt');

    const frittenwerkAdmin = await login(baseUrl, tenantCredentials.frittenwerk);
    assert(
      frittenwerkAdmin.body.user.tenantId === frittenwerk._id,
      'Frittenwerk Admin hat falschen Tenant-Kontext',
    );
    const burgermaniaAdmin = await login(baseUrl, tenantCredentials.burgermania);
    assert(
      burgermaniaAdmin.body.user.tenantId === burgermania._id,
      'BurgerMania Admin hat falschen Tenant-Kontext',
    );
    const demoTestAdmin = await login(
      baseUrl,
      tenantCredentials.demoTestTenant,
    );
    assert(
      demoTestAdmin.body.user.tenantId === demoTestTenant._id,
      'Demo Test Tenant Admin hat falschen Tenant-Kontext',
    );

    const frittenwerkLocation = await locationModel
      .findOne({ tenantId: frittenwerk._id, isActive: { $ne: false } })
      .lean()
      .exec();
    assert(frittenwerkLocation, 'Frittenwerk Demo hat keinen aktiven Standort');
    const frittenwerkLocationId = frittenwerkLocation._id.toString();

    const moduleSnapshot = await snapshotTenantModules(
      baseUrl,
      platformToken,
      frittenwerk._id,
    );
    const burgerManiaSnapshot = await snapshotTenantModules(
      baseUrl,
      platformToken,
      burgermania._id,
    );

    try {
      await assertRequiredModulesExist(moduleSnapshot);
      await assertTenantModuleStatusEndpoint(
        baseUrl,
        frittenwerkAdmin.body.accessToken,
        moduleSnapshot,
      );
      await assertSystemLockedCannotBeDisabled(
        baseUrl,
        platformToken,
        frittenwerk._id,
      );
      await assertNoGlobalToggle(baseUrl, platformToken);

      const blockedModules: Record<string, number> = {};
      for (const probe of moduleProbes) {
        await setTenantModule(
          baseUrl,
          platformToken,
          frittenwerk._id,
          probe.moduleKey,
          true,
        );
        const enabledProbe = await request<ApiJson>(
          baseUrl,
          probe.method ?? 'GET',
          resolveProbePath(probe.path, frittenwerkLocationId),
          frittenwerkAdmin.body.accessToken,
        );
        assertOkOrBusinessValidation(
          enabledProbe,
          `aktiviertes Modul ${probe.moduleKey}`,
        );

        await setTenantModule(
          baseUrl,
          platformToken,
          frittenwerk._id,
          probe.moduleKey,
          false,
        );
        const disabledProbe = await request<ApiJson>(
          baseUrl,
          probe.method ?? 'GET',
          resolveProbePath(probe.path, frittenwerkLocationId),
          frittenwerkAdmin.body.accessToken,
        );
        assertStatus(
          disabledProbe,
          403,
          `deaktiviertes Modul ${probe.moduleKey} blockiert API`,
        );
        blockedModules[probe.moduleKey] = disabledProbe.status;

        const tenantModules = await request<TenantModuleBody[]>(
          baseUrl,
          'GET',
          '/tenant/modules',
          frittenwerkAdmin.body.accessToken,
        );
        assertStatus(
          tenantModules,
          200,
          `Tenant Module nach Deaktivierung ${probe.moduleKey}`,
        );
        assert(
          tenantModules.body.some(
            (moduleConfig) =>
              moduleConfig.key === probe.moduleKey && !moduleConfig.enabled,
          ),
          `Tenant-Modulstatus zeigt ${probe.moduleKey} nicht als deaktiviert`,
        );
      }

      await assertTenantIndependence(
        baseUrl,
        platformToken,
        frittenwerk._id,
        burgermania._id,
        burgermaniaAdmin.body.accessToken,
        burgerManiaSnapshot,
      );

      const persistedTenant = await tenantModel
        .findById(frittenwerk._id)
        .lean()
        .exec();
      assert(Boolean(persistedTenant), 'Frittenwerk Tenant ist nicht persistent');

      console.log(
        JSON.stringify(
          {
            tenants: {
              frittenwerkDemo: frittenwerk._id,
              burgerMania: burgermania._id,
              demoTestTenant: demoTestTenant._id,
            },
            frittenwerkLocationId,
            checkedModules: requiredModuleKeys,
            backendApiBlockedWhenDisabled: blockedModules,
            tenantIndependence: true,
            platformModuleManagement: true,
            systemLockedProtection: true,
            noGlobalModuleToggle: true,
            demoTestTenantLogin: true,
            buglist: {
              kritisch: [],
              hoch: [],
              mittel: [],
              niedrig: [],
            },
          },
          null,
          2,
        ),
      );
    } finally {
      await restoreTenantModules(
        baseUrl,
        platformToken,
        frittenwerk._id,
        moduleSnapshot,
      );
      await restoreTenantModules(
        baseUrl,
        platformToken,
        burgermania._id,
        burgerManiaSnapshot,
      );
    }
  } finally {
    await app.close();
  }
}

async function loadRequiredTenants(
  baseUrl: string,
  token: string,
): Promise<Map<string, TenantBody>> {
  const tenants = await request<TenantBody[]>(
    baseUrl,
    'GET',
    '/platform/tenants',
    token,
  );
  assertStatus(tenants, 200, 'Platform Tenantliste laden');
  const map = new Map(tenants.body.map((tenant) => [tenant.slug, tenant]));

  for (const slug of requiredTenantSlugs) {
    assert(map.has(slug), `Pflichttenant ${slug} fehlt`);
  }

  return map;
}

async function assertRequiredModulesExist(
  snapshot: TenantModuleBody[],
): Promise<void> {
  for (const moduleKey of requiredModuleKeys) {
    assert(
      snapshot.some((moduleConfig) => moduleConfig.key === moduleKey),
      `Moduldefinition ${moduleKey} fehlt`,
    );
  }
}

async function assertTenantModuleStatusEndpoint(
  baseUrl: string,
  tenantToken: string,
  platformSnapshot: TenantModuleBody[],
): Promise<void> {
  const tenantModules = await request<TenantModuleBody[]>(
    baseUrl,
    'GET',
    '/tenant/modules',
    tenantToken,
  );
  assertStatus(tenantModules, 200, 'Tenant-Modulstatus laden');

  for (const moduleConfig of platformSnapshot) {
    const tenantModule = tenantModules.body.find(
      (row) => row.key === moduleConfig.key,
    );
    assert(
      tenantModule && tenantModule.enabled === moduleConfig.enabled,
      `Tenant-Modulstatus fuer ${moduleConfig.key} weicht von Platform-Sicht ab`,
    );
  }
}

async function assertSystemLockedCannotBeDisabled(
  baseUrl: string,
  token: string,
  tenantId: string,
): Promise<void> {
  const result = await request<ApiJson>(
    baseUrl,
    'PATCH',
    `/platform/tenants/${tenantId}/modules/module_management`,
    token,
    { enabled: false },
  );
  assertStatus(result, 403, 'systemLocked Modul deaktivieren');
}

async function assertNoGlobalToggle(
  baseUrl: string,
  token: string,
): Promise<void> {
  const result = await request<ApiJson>(
    baseUrl,
    'PATCH',
    '/platform/modules/kds/enabled',
    token,
    { enabled: false },
  );
  assertStatus(result, 404, 'globalen Modul-Toggle verhindern');
}

async function assertTenantIndependence(
  baseUrl: string,
  platformToken: string,
  frittenwerkTenantId: string,
  burgerManiaTenantId: string,
  burgerManiaToken: string,
  burgerManiaSnapshot: TenantModuleBody[],
): Promise<void> {
  await setTenantModule(
    baseUrl,
    platformToken,
    frittenwerkTenantId,
    KDS_MODULE_KEY,
    false,
  );
  const burgerManiaModules = await request<TenantModuleBody[]>(
    baseUrl,
    'GET',
    `/platform/tenants/${burgerManiaTenantId}/modules`,
    platformToken,
  );
  assertStatus(burgerManiaModules, 200, 'BurgerMania Module nach Frittenwerk Toggle');
  assert(
    JSON.stringify(sortModules(burgerManiaModules.body)) ===
      JSON.stringify(sortModules(burgerManiaSnapshot)),
    'Frittenwerk Modulwechsel hat BurgerMania Module beeinflusst',
  );

  const burgerTenantModules = await request<TenantModuleBody[]>(
    baseUrl,
    'GET',
    '/tenant/modules',
    burgerManiaToken,
  );
  assertStatus(burgerTenantModules, 200, 'BurgerMania Tenant-Modulstatus');
  assert(
    JSON.stringify(sortModules(burgerTenantModules.body)) ===
      JSON.stringify(sortModules(burgerManiaSnapshot)),
    'BurgerMania Tenant-Sicht wurde durch Frittenwerk Toggle beeinflusst',
  );
}

async function snapshotTenantModules(
  baseUrl: string,
  token: string,
  tenantId: string,
): Promise<TenantModuleBody[]> {
  const modules = await request<TenantModuleBody[]>(
    baseUrl,
    'GET',
    `/platform/tenants/${tenantId}/modules`,
    token,
  );
  assertStatus(modules, 200, `Tenant ${tenantId} Module laden`);
  return modules.body.map((moduleConfig) => ({ ...moduleConfig }));
}

async function restoreTenantModules(
  baseUrl: string,
  token: string,
  tenantId: string,
  snapshot: TenantModuleBody[],
): Promise<void> {
  for (const moduleConfig of snapshot) {
    const restored = await request<TenantModuleBody>(
      baseUrl,
      'PATCH',
      `/platform/tenants/${tenantId}/modules/${moduleConfig.key}`,
      token,
      { enabled: moduleConfig.enabled },
    );
    assertStatus(restored, 200, `Modul ${moduleConfig.key} wiederherstellen`);
  }
}

async function setTenantModule(
  baseUrl: string,
  token: string,
  tenantId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<void> {
  const result = await request<TenantModuleBody>(
    baseUrl,
    'PATCH',
    `/platform/tenants/${tenantId}/modules/${moduleKey}`,
    token,
    { enabled },
  );
  assertStatus(result, 200, `Modul ${moduleKey} auf ${enabled} setzen`);
  assert(
    result.body.enabled === enabled,
    `Modul ${moduleKey} wurde nicht auf ${enabled} gesetzt`,
  );
}

async function login(
  baseUrl: string,
  credentials: { email: string; password: string },
): Promise<ApiResult<LoginBody>> {
  const result = await request<LoginBody>(
    baseUrl,
    'POST',
    '/auth/login',
    undefined,
    credentials,
  );
  assertStatus(result, 201, `Login ${credentials.email}`);
  assert(result.body.accessToken, `Login ${credentials.email} liefert keinen Token`);
  return result;
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

function resolveProbePath(
  path: string | undefined,
  locationId: string,
): string {
  assert(path, 'Probe ohne API-Pfad');
  return path.replaceAll(':locationId', encodeURIComponent(locationId));
}

function assertOkOrBusinessValidation<T>(
  result: ApiResult<T>,
  label: string,
): void {
  assert(
    [200, 201, 204, 400, 404].includes(result.status),
    `${label}: erwartet erreichbare API, erhalten ${result.status} (${JSON.stringify(
      result.body,
    )})`,
  );
  assert(
    result.status !== 403,
    `${label}: API wurde trotz aktivem Modul mit 403 blockiert (${JSON.stringify(
      result.body,
    )})`,
  );
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

function sortModules(modules: TenantModuleBody[]) {
  return modules
    .map((moduleConfig) => ({
      key: moduleConfig.key,
      enabled: moduleConfig.enabled,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

void verifyTenantModules();
