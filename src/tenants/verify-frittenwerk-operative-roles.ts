import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AddressInfo } from 'node:net';
import { AppModule } from '../app.module';
import { Area, AreaDocument } from '../areas/schemas/area.schema';
import { Role } from '../auth/enums/role.enum';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { MenuItem, MenuItemDocument } from '../menu-items/schemas/menu-item.schema';
import {
  COUNTER_ORDERS_MODULE_KEY,
  KDS_MODULE_KEY,
  POS_MODULE_KEY,
  STAFF_MANAGEMENT_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
  TIME_TRACKING_MODULE_KEY,
} from '../modules/constants/module-definitions';
import {
  CourseType,
  Order,
  OrderDocument,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  ProductionArea,
} from '../orders/schemas/order.schema';
import { Region, RegionDocument } from '../regions/schemas/region.schema';
import {
  StaffAbsence,
  StaffAbsenceDocument,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  TimeEntry,
  TimeEntryDocument,
} from '../time-tracking/schemas/time-entry.schema';
import { Tenant, TenantDocument } from './schemas/tenant.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentDocument,
} from '../users/schemas/user-location-assignment.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

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
    permissions?: string[];
    tenantId?: string;
    locationId?: string;
    locationIds?: string[];
    locationAssignments?: LocationAssignmentBody[];
  };
}

interface LocationAssignmentBody {
  locationId: string;
  role: string;
  isPrimary?: boolean;
}

interface EntityBody {
  [key: string]: unknown;
  _id: string;
  tenantId?: string;
  locationId?: string;
  items?: Array<{ _id: string; status?: string }>;
  status?: string;
}

interface TenantModuleBody {
  key?: string;
  moduleKey?: string;
  enabled: boolean;
}

type ApiJson = Record<string, unknown> | Record<string, unknown>[];

interface RoleScenario {
  key: string;
  email: string;
  expectedRole: Role;
  expectedPermissions: string[];
  forbiddenPermissions: string[];
  allowedApiPaths: string[];
  forbiddenApiPaths: string[];
  foreignScopedPaths: string[];
}

const password = 'Demo2026!';
const tenantSlug = 'frittenwerk-demo';
const smokePrefix = 'S5-Smoke';

const roleScenarios: RoleScenario[] = [
  {
    key: 'WAITER',
    email: 'service1.duesseldorf@frittenwerk-demo.demo',
    expectedRole: Role.Service,
    expectedPermissions: [
      'orders.view',
      'orders.create',
      'tables.view',
      'schedule.view',
      'timeTracking.view',
      'absence.view',
    ],
    forbiddenPermissions: [
      'kds.view',
      'counter.orders.view',
      'inventory.view',
      'employees.view',
      'payroll.view',
    ],
    allowedApiPaths: [
      '/orders?locationId=:ownLocationId',
      '/staff/shifts?mine=true',
      '/staff/absences?employeeId=:userId',
      '/time-tracking/me?locationId=:ownLocationId',
    ],
    forbiddenApiPaths: [
      '/kds/orders?locationId=:ownLocationId',
      '/counter/orders?locationId=:ownLocationId',
      '/stock?locationId=:ownLocationId',
    ],
    foreignScopedPaths: ['/orders?locationId=:foreignLocationId'],
  },
  {
    key: 'KITCHEN',
    email: 'kueche1.duesseldorf@frittenwerk-demo.demo',
    expectedRole: Role.Kueche,
    expectedPermissions: [
      'kds.view',
      'kds.manage',
      'schedule.view',
      'timeTracking.view',
      'absence.view',
    ],
    forbiddenPermissions: [
      'orders.view',
      'counter.orders.view',
      'inventory.view',
      'employees.view',
      'payroll.view',
    ],
    allowedApiPaths: [
      '/kds/orders?locationId=:ownLocationId',
      '/staff/shifts?mine=true',
      '/staff/absences?employeeId=:userId',
      '/time-tracking/me?locationId=:ownLocationId',
    ],
    forbiddenApiPaths: [
      '/orders?locationId=:ownLocationId',
      '/counter/orders?locationId=:ownLocationId',
      '/stock?locationId=:ownLocationId',
    ],
    foreignScopedPaths: ['/kds/orders?locationId=:foreignLocationId'],
  },
  {
    key: 'COUNTER',
    email: 'counter.duesseldorf@frittenwerk-demo.demo',
    expectedRole: Role.Theke,
    expectedPermissions: [
      'counter.orders.view',
      'counter.orders.create',
      'counter.orders.update',
      'schedule.view',
      'timeTracking.view',
      'absence.view',
    ],
    forbiddenPermissions: [
      'orders.view',
      'kds.view',
      'inventory.view',
      'employees.view',
      'payroll.view',
    ],
    allowedApiPaths: [
      '/counter/orders?locationId=:ownLocationId',
      '/counter/dashboard?locationId=:ownLocationId',
      '/staff/shifts?mine=true',
      '/staff/absences?employeeId=:userId',
      '/time-tracking/me?locationId=:ownLocationId',
    ],
    forbiddenApiPaths: [
      '/orders?locationId=:ownLocationId',
      '/kds/orders?locationId=:ownLocationId',
      '/stock?locationId=:ownLocationId',
    ],
    foreignScopedPaths: ['/counter/orders?locationId=:foreignLocationId'],
  },
  {
    key: 'CASHIER',
    email: 'cashier.duesseldorf@frittenwerk-demo.demo',
    expectedRole: Role.Kasse,
    expectedPermissions: [
      'counter.orders.view',
      'counter.orders.pay',
      'schedule.view',
      'timeTracking.view',
      'absence.view',
    ],
    forbiddenPermissions: [
      'orders.view',
      'kds.view',
      'inventory.view',
      'employees.view',
      'payroll.view',
    ],
    allowedApiPaths: [
      '/counter/orders?locationId=:ownLocationId',
      '/counter/dashboard?locationId=:ownLocationId',
      '/staff/shifts?mine=true',
      '/staff/absences?employeeId=:userId',
      '/time-tracking/me?locationId=:ownLocationId',
    ],
    forbiddenApiPaths: [
      '/orders?locationId=:ownLocationId',
      '/kds/orders?locationId=:ownLocationId',
      '/stock?locationId=:ownLocationId',
    ],
    foreignScopedPaths: ['/counter/orders?locationId=:foreignLocationId'],
  },
  {
    key: 'INVENTORY_MANAGER',
    email: 'inventory.duesseldorf@frittenwerk-demo.demo',
    expectedRole: Role.Lager,
    expectedPermissions: [
      'inventory.view',
      'schedule.view',
      'timeTracking.view',
      'absence.view',
    ],
    forbiddenPermissions: [
      'orders.view',
      'counter.orders.view',
      'kds.view',
      'employees.view',
      'payroll.view',
    ],
    allowedApiPaths: [
      '/stock?locationId=:ownLocationId',
      '/stock/dashboard?locationId=:ownLocationId',
      '/staff/shifts?mine=true',
      '/staff/absences?employeeId=:userId',
      '/time-tracking/me?locationId=:ownLocationId',
    ],
    forbiddenApiPaths: [
      '/orders?locationId=:ownLocationId',
      '/counter/orders?locationId=:ownLocationId',
      '/kds/orders?locationId=:ownLocationId',
    ],
    foreignScopedPaths: ['/stock?locationId=:foreignLocationId'],
  },
  {
    key: 'STAFF',
    email: 'staff.duesseldorf@frittenwerk-demo.demo',
    expectedRole: Role.Staff,
    expectedPermissions: [
      'schedule.view',
      'timeTracking.view',
      'absence.view',
    ],
    forbiddenPermissions: [
      'orders.view',
      'counter.orders.view',
      'kds.view',
      'inventory.view',
      'employees.view',
      'payroll.view',
    ],
    allowedApiPaths: [
      '/staff/shifts?mine=true',
      '/staff/absences?employeeId=:userId',
      '/time-tracking/me?locationId=:ownLocationId',
    ],
    forbiddenApiPaths: [
      '/orders?locationId=:ownLocationId',
      '/counter/orders?locationId=:ownLocationId',
      '/kds/orders?locationId=:ownLocationId',
      '/stock?locationId=:ownLocationId',
    ],
    foreignScopedPaths: [
      '/staff/shifts?locationId=:foreignLocationId',
      '/time-tracking/me?locationId=:foreignLocationId',
    ],
  },
];

const commonForbiddenApiPaths = [
  '/platform/tenants',
  '/tenant/areas',
  '/tenant/regions',
  '/tenant/cities',
  '/tenant/locations',
  '/employees',
  '/payroll',
];

const requiredModules = [
  POS_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
  COUNTER_ORDERS_MODULE_KEY,
  KDS_MODULE_KEY,
  STAFF_MANAGEMENT_MODULE_KEY,
  TIME_TRACKING_MODULE_KEY,
];

async function verifyFrittenwerkOperativeRoles() {
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
    const models = resolveModels(app);
    const tenant = await models.tenant
      .findOne({ slug: tenantSlug, deletedAt: null })
      .lean()
      .exec();
    assert(tenant, 'Frittenwerk Demo Tenant existiert nicht');
    const tenantId = tenant._id.toString();

    await cleanupSmokeData(models, tenantId);

    const loginResults = await Promise.all(
      roleScenarios.map((scenario) => loginScenario(baseUrl, scenario)),
    );
    const ownLocationId = resolveSharedOwnLocationId(loginResults);
    const foreignLocation = await ensureForeignLocation(models, tenantId, ownLocationId);
    const foreignLocationId = foreignLocation._id.toString();
    const enabledModules = await verifyTenantModules(
      baseUrl,
      loginResults[0].token,
    );
    const scenarioResults: Record<string, unknown> = {};

    for (const login of loginResults) {
      scenarioResults[login.scenario.key] = await verifyScenario(
        baseUrl,
        login,
        ownLocationId,
        foreignLocationId,
      );
    }

    await verifyKitchenStatusAggregation(
      baseUrl,
      loginResults.find((login) => login.scenario.key === 'KITCHEN')?.token,
      models,
      tenantId,
      ownLocationId,
    );
    await verifyCounterCreate(
      baseUrl,
      loginResults.find((login) => login.scenario.key === 'COUNTER')?.token,
      models,
      tenantId,
      ownLocationId,
    );

    await cleanupSmokeData(models, tenantId);

    console.log(
      JSON.stringify(
        {
          tenantId,
          ownLocationId,
          foreignLocationId,
          modules: enabledModules,
          roles: scenarioResults,
          kdsStatusAggregation: true,
          counterOrderCreate: true,
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
    await app.close();
  }
}

function resolveModels(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  return {
    tenant: app.get<Model<TenantDocument>>(getModelToken(Tenant.name)),
    area: app.get<Model<AreaDocument>>(getModelToken(Area.name)),
    region: app.get<Model<RegionDocument>>(getModelToken(Region.name)),
    city: app.get<Model<CityDocument>>(getModelToken(City.name)),
    location: app.get<Model<LocationDocument>>(getModelToken(Location.name)),
    user: app.get<Model<UserDocument>>(getModelToken(User.name)),
    assignment: app.get<Model<UserLocationAssignmentDocument>>(
      getModelToken(UserLocationAssignment.name),
    ),
    order: app.get<Model<OrderDocument>>(getModelToken(Order.name)),
    menuItem: app.get<Model<MenuItemDocument>>(getModelToken(MenuItem.name)),
    staffAbsence: app.get<Model<StaffAbsenceDocument>>(
      getModelToken(StaffAbsence.name),
    ),
    timeEntry: app.get<Model<TimeEntryDocument>>(getModelToken(TimeEntry.name)),
  };
}

async function loginScenario(baseUrl: string, scenario: RoleScenario) {
  const login = await request<LoginBody>(baseUrl, 'POST', '/auth/login', undefined, {
    email: scenario.email,
    password,
  });
  assertStatus(login, 201, `${scenario.key} Login`);
  assert(login.body.accessToken, `${scenario.key} Login liefert keinen Token`);
  assert(login.body.user.tenantId, `${scenario.key} Login hat keinen Tenant`);
  assert(
    includesNormalized(login.body.user.roles, scenario.expectedRole),
    `${scenario.key} Login liefert erwartete Rolle ${scenario.expectedRole} nicht`,
  );
  assert(
    !includesNormalized(login.body.user.roles, Role.PlatformAdmin) &&
      !includesNormalized(login.body.user.roles, Role.TenantAdmin),
    `${scenario.key} darf keine Platform/Tenant-Adminrolle besitzen`,
  );
  assert(
    login.body.user.locationAssignments?.length,
    `${scenario.key} hat keine Standortzuordnung`,
  );

  for (const permission of scenario.expectedPermissions) {
    assert(
      hasPermission(login.body.user.permissions, permission),
      `${scenario.key} fehlt Permission ${permission}`,
    );
  }
  for (const permission of scenario.forbiddenPermissions) {
    assert(
      !hasPermission(login.body.user.permissions, permission),
      `${scenario.key} besitzt verbotene Permission ${permission}`,
    );
  }

  return {
    scenario,
    token: login.body.accessToken,
    user: login.body.user,
  };
}

function resolveSharedOwnLocationId(
  logins: Awaited<ReturnType<typeof loginScenario>>[],
): string {
  const primaryLocationIds = logins.map(
    (login) =>
      login.user.locationAssignments?.find((assignment) => assignment.isPrimary)
        ?.locationId ??
      login.user.locationId ??
      login.user.locationIds?.[0],
  );
  const ownLocationId = primaryLocationIds[0];
  assert(ownLocationId, 'Kein primaerer operativer Standort gefunden');
  assert(
    primaryLocationIds.every((locationId) => locationId === ownLocationId),
    'Operative S5-Testuser liegen nicht am gleichen Primaerstandort',
  );

  return ownLocationId;
}

async function verifyTenantModules(
  baseUrl: string,
  token: string,
): Promise<string[]> {
  const result = await request<TenantModuleBody[]>(
    baseUrl,
    'GET',
    '/tenant/modules',
    token,
  );
  assertStatus(result, 200, 'Tenant Module laden');
  const enabledModules = result.body
    .filter((moduleConfig) => moduleConfig.enabled)
    .map((moduleConfig) => moduleConfig.key ?? moduleConfig.moduleKey ?? '');

  for (const moduleKey of requiredModules) {
    assert(
      enabledModules.includes(moduleKey),
      `Pflichtmodul ${moduleKey} ist fuer Frittenwerk Demo nicht aktiv`,
    );
  }

  return enabledModules;
}

async function verifyScenario(
  baseUrl: string,
  login: Awaited<ReturnType<typeof loginScenario>>,
  ownLocationId: string,
  foreignLocationId: string,
) {
  const allowedStatuses: Record<string, number> = {};
  const forbiddenStatuses: Record<string, number> = {};
  const foreignStatuses: Record<string, number> = {};

  for (const path of login.scenario.allowedApiPaths) {
    const resolvedPath = resolvePath(path, login.user._id, ownLocationId, foreignLocationId);
    const result = await request<ApiJson>(baseUrl, 'GET', resolvedPath, login.token);
    assertStatus(result, 200, `${login.scenario.key} erlaubt ${resolvedPath}`);
    assertNoForeignLocation(result.body, foreignLocationId, `${login.scenario.key} ${resolvedPath}`);
    allowedStatuses[resolvedPath] = result.status;
  }

  for (const path of [...commonForbiddenApiPaths, ...login.scenario.forbiddenApiPaths]) {
    const resolvedPath = resolvePath(path, login.user._id, ownLocationId, foreignLocationId);
    const result = await request<ApiJson>(baseUrl, 'GET', resolvedPath, login.token);
    assertBlocked(result, `${login.scenario.key} verboten ${resolvedPath}`);
    forbiddenStatuses[resolvedPath] = result.status;
  }

  for (const path of login.scenario.foreignScopedPaths) {
    const resolvedPath = resolvePath(path, login.user._id, ownLocationId, foreignLocationId);
    const result = await request<ApiJson>(baseUrl, 'GET', resolvedPath, login.token);
    assertBlocked(result, `${login.scenario.key} Fremdstandort ${resolvedPath}`);
    foreignStatuses[resolvedPath] = result.status;
  }

  await verifyOwnAbsenceRequest(baseUrl, login.token, login.user._id, ownLocationId, login.scenario.key);

  return {
    email: login.scenario.email,
    roles: login.user.roles ?? [],
    permissions: login.user.permissions ?? [],
    allowedStatuses,
    forbiddenStatuses,
    foreignStatuses,
    ownAbsenceRequestWorks: true,
  };
}

async function verifyOwnAbsenceRequest(
  baseUrl: string,
  token: string,
  userId: string,
  locationId: string,
  label: string,
): Promise<void> {
  const suffix = `${Date.now()}-${label.toLowerCase()}`;
  const absence = await request<EntityBody>(baseUrl, 'POST', '/staff/absences', token, {
    employeeId: userId,
    userId,
    locationId,
    type: 'vacation',
    startDate: '2034-01-10T00:00:00.000Z',
    endDate: '2034-01-10T23:59:59.000Z',
    reason: `${smokePrefix} ${suffix}`,
  });
  assertStatus(absence, 201, `${label} eigene Abwesenheit beantragen`);

  const cancelled = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/staff/absences/${absence.body._id}/cancel`,
    token,
  );
  assertStatus(cancelled, 200, `${label} eigene Abwesenheit stornieren`);
}

async function verifyKitchenStatusAggregation(
  baseUrl: string,
  token: string | undefined,
  models: ReturnType<typeof resolveModels>,
  tenantId: string,
  locationId: string,
): Promise<void> {
  assert(token, 'KITCHEN Token fehlt');
  const order = await models.order.create({
    tenantId,
    locationId,
    orderNumber: `S5-KDS-${Date.now()}`,
    source: OrderSource.Internal,
    status: OrderStatus.New,
    paymentStatus: PaymentStatus.Open,
    guestCount: 1,
    subtotal: 10,
    tax: 0,
    total: 10,
    notes: `${smokePrefix} KDS Aggregation`,
    items: [
      {
        name: `${smokePrefix} Burger`,
        quantity: 1,
        price: 10,
        totalPrice: 10,
        isKitchenItem: true,
        status: OrderItemStatus.Open,
        productionArea: ProductionArea.Kitchen,
        courseType: CourseType.Main,
      },
    ],
  });
  const itemId = order.items[0]?._id?.toString();
  assert(itemId, 'S5 KDS Smoke-Order hat keine Positions-ID');

  const started = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/kds/orders/${order._id.toString()}/items/${itemId}/status`,
    token,
    {
      status: 'started',
      employeeName: 'S5 Kueche',
    },
  );
  assertStatus(started, 200, 'KITCHEN KDS Item starten');
  assert(
    started.body.status === OrderStatus.Preparing,
    `KDS Statusaggregation liefert ${started.body.status}`,
  );
}

async function verifyCounterCreate(
  baseUrl: string,
  token: string | undefined,
  models: ReturnType<typeof resolveModels>,
  tenantId: string,
  locationId: string,
): Promise<void> {
  assert(token, 'COUNTER Token fehlt');
  const menuItem = await models.menuItem
    .findOne({
      $or: [{ tenantId }, { tenantId: { $exists: false } }],
      isActive: { $ne: false },
    })
    .lean()
    .exec();
  assert(menuItem, 'Kein Menueartikel fuer S5 Theken-Smoke gefunden');

  const created = await request<EntityBody>(baseUrl, 'POST', '/counter/orders', token, {
    locationId,
    customerName: 'S5 Smoke Gast',
    notes: `${smokePrefix} Counter Create`,
    items: [
      {
        menuItemId: menuItem._id.toString(),
        quantity: 1,
        isKitchenItem: Boolean(menuItem.isKitchenItem),
      },
    ],
  });
  assertStatus(created, 201, 'COUNTER Thekenbestellung erstellen');
}

async function ensureForeignLocation(
  models: ReturnType<typeof resolveModels>,
  tenantId: string,
  ownLocationId: string,
): Promise<LocationDocument> {
  const existingForeign = await models.location
    .findOne({
      tenantId,
      _id: { $ne: ownLocationId },
      name: { $not: /^S5-Smoke/ },
    })
    .exec();

  if (existingForeign) {
    return existingForeign;
  }

  const suffix = Date.now();
  const area = await models.area.create({
    tenantId,
    name: `${smokePrefix} Area ${suffix}`,
    description: 'S5 Fremdstandort Bereich',
    isActive: true,
  });
  const region = await models.region.create({
    tenantId,
    areaId: area._id.toString(),
    name: `${smokePrefix} Region ${suffix}`,
    description: 'S5 Fremdstandort Region',
    isActive: true,
  });
  const city = await models.city.create({
    tenantId,
    areaId: area._id.toString(),
    regionId: region._id.toString(),
    name: `${smokePrefix} City ${suffix}`,
    description: 'S5 Fremdstandort Stadt',
    isActive: true,
  });

  return models.location.create({
    tenantId,
    areaId: area._id.toString(),
    regionId: region._id.toString(),
    cityId: city._id.toString(),
    name: `${smokePrefix} Foreign Location ${suffix}`,
    slug: `s5-smoke-foreign-location-${suffix}`,
    address: 'S5 Teststrasse 2, 50667 Koeln',
    street: 'S5 Teststrasse 2',
    addressLine1: 'S5 Teststrasse 2',
    zip: '50667',
    postalCode: '50667',
    city: 'Koeln',
    cityName: 'Koeln',
    country: 'Deutschland',
    phone: '0221 000005',
    email: `s5.foreign.${suffix}@frittenwerk-demo.demo`,
    isActive: true,
  });
}

async function cleanupSmokeData(
  models: ReturnType<typeof resolveModels>,
  tenantId: string,
): Promise<void> {
  const smokeLocations = await models.location
    .find({ tenantId, name: /^S5-Smoke/ })
    .select('_id')
    .lean()
    .exec();
  const smokeLocationIds = smokeLocations.map((location) =>
    location._id.toString(),
  );

  await Promise.all([
    models.staffAbsence
      .deleteMany({ tenantId, reason: /^S5-Smoke/ })
      .exec(),
    models.timeEntry
      .deleteMany({ tenantId, note: /^S5-Smoke/ })
      .exec(),
    models.order
      .deleteMany({
        tenantId,
        $or: [
          { notes: /^S5-Smoke/ },
          { orderNumber: /^S5-/ },
          { locationId: { $in: smokeLocationIds } },
        ],
      })
      .exec(),
    models.assignment
      .deleteMany({ tenantId, locationId: { $in: smokeLocationIds } })
      .exec(),
  ]);

  await Promise.all([
    models.location.deleteMany({ tenantId, _id: { $in: smokeLocationIds } }).exec(),
    models.city.deleteMany({ tenantId, name: /^S5-Smoke/ }).exec(),
    models.region.deleteMany({ tenantId, name: /^S5-Smoke/ }).exec(),
    models.area.deleteMany({ tenantId, name: /^S5-Smoke/ }).exec(),
  ]);
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

function resolvePath(
  path: string,
  userId: string,
  ownLocationId: string,
  foreignLocationId: string,
): string {
  return path
    .replaceAll(':userId', encodeURIComponent(userId))
    .replaceAll(':ownLocationId', encodeURIComponent(ownLocationId))
    .replaceAll(':foreignLocationId', encodeURIComponent(foreignLocationId));
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

function assertBlocked<T>(result: ApiResult<T>, label: string): void {
  assert(
    [403, 404].includes(result.status),
    `${label}: erwartet 403/404, erhalten ${result.status} (${JSON.stringify(
      result.body,
    )})`,
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function includesNormalized(values: string[] | undefined, expected: string): boolean {
  const normalizedExpected = normalizeRole(expected);
  return (values ?? []).some((value) => normalizeRole(value) === normalizedExpected);
}

function normalizeRole(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function hasPermission(permissions: string[] | undefined, permission: string): boolean {
  return Boolean(
    permissions?.includes('*') ||
      permissions?.includes(permission) ||
      permissions?.includes(`${permission.split('.')[0]}.*`),
  );
}

function assertNoForeignLocation(
  body: unknown,
  foreignLocationId: string,
  label: string,
): void {
  const serialized = JSON.stringify(body);
  assert(
    !serialized.includes(foreignLocationId),
    `${label}: Fremdstandortdaten sichtbar`,
  );
}

void verifyFrittenwerkOperativeRoles();
