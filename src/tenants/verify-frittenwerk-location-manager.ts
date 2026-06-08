import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { AddressInfo } from 'node:net';
import { AccessPolicyService } from '../access/access-policy.service';
import { AppModule } from '../app.module';
import { Area, AreaDocument } from '../areas/schemas/area.schema';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import {
  COUNTER_ORDERS_MODULE_KEY,
  DIGITAL_MENU_MODULE_KEY,
  KDS_MODULE_KEY,
  POS_MODULE_KEY,
  STAFF_MANAGEMENT_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
  TIME_TRACKING_MODULE_KEY,
} from '../modules/constants/module-definitions';
import {
  Order,
  OrderDocument,
  OrderItemStatus,
  OrderStatus,
} from '../orders/schemas/order.schema';
import { Region, RegionDocument } from '../regions/schemas/region.schema';
import {
  StaffAbsence,
  StaffAbsenceDocument,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  StaffShift,
  StaffShiftDocument,
} from '../staff-planning/schemas/staff-shift.schema';
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
import {
  MenuItem,
  MenuItemDocument,
} from '../menu-items/schemas/menu-item.schema';

interface ApiResult<T> {
  status: number;
  body: T;
}

interface LoginBody {
  accessToken: string;
  user: EntityBody & {
    roles?: string[];
    permissions?: string[];
    locationAssignments?: LocationAssignmentBody[];
    locationIds?: string[];
    managedLocationIds?: string[];
  };
}

interface TenantModuleBody {
  key?: string;
  moduleKey?: string;
  enabled: boolean;
}

interface EntityBody {
  [key: string]: unknown;
  _id: string;
  tenantId?: string;
  name?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  locationId?: string;
  locationIds?: string[];
  managedLocationIds?: string[];
  locationAssignments?: LocationAssignmentBody[];
  items?: OrderItemBody[];
  status?: string;
}

interface LocationAssignmentBody {
  _id?: string;
  tenantId?: string;
  userId?: string;
  locationId: string;
  role: string;
  isPrimary?: boolean;
}

interface OrderItemBody {
  _id: string;
  name?: string;
  status?: string;
}

type ApiJson = Record<string, unknown> | Record<string, unknown>[];

const credentials = {
  email: 'filialleiter.duesseldorf@frittenwerk-demo.demo',
  password: 'Demo2026!',
};

const requiredModules = [
  POS_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
  COUNTER_ORDERS_MODULE_KEY,
  KDS_MODULE_KEY,
  DIGITAL_MENU_MODULE_KEY,
  STAFF_MANAGEMENT_MODULE_KEY,
  TIME_TRACKING_MODULE_KEY,
];

const forbiddenTenantNames = [
  'BurgerMania',
  'Crispy Chicken',
  'Pasta House',
  'Grill Factory',
  'Demo Test Tenant',
];

async function verifyFrittenwerkLocationManager() {
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
    const accessPolicy = app.get(AccessPolicyService);
    const tenant = await models.tenant
      .findOne({ slug: 'frittenwerk-demo', deletedAt: null })
      .lean()
      .exec();
    assert(tenant, 'Frittenwerk Demo Tenant existiert nicht');
    const tenantId = tenant._id.toString();

    await cleanupSmokeData(models, tenantId);

    const login = await request<LoginBody>(
      baseUrl,
      'POST',
      '/auth/login',
      undefined,
      credentials,
    );
    assertStatus(login, 201, 'Filialleiter Login');
    assert(login.body.user.tenantId === tenantId, 'Login hat falschen Tenant');
    assert(
      includesNormalized(login.body.user.roles, Role.Filialleiter) ||
        includesNormalized(login.body.user.roles, Role.LocationManager),
      'Login liefert keine Filialleiter/LocationManager-Rolle',
    );
    assert(
      !includesNormalized(login.body.user.roles, Role.TenantAdmin) &&
        !includesNormalized(login.body.user.roles, Role.PlatformAdmin),
      'Filialleiter darf keine TenantAdmin/PlatformAdmin-Rolle besitzen',
    );
    assert(
      !hasPermission(login.body.user.permissions, 'payroll.view'),
      'Filialleiter darf keine Payroll-Berechtigung besitzen',
    );

    const token = login.body.accessToken;
    const ownLocationIds = [
      ...new Set([
        ...(login.body.user.managedLocationIds ?? []),
        ...(login.body.user.locationIds ?? []),
        ...(login.body.user.locationAssignments
          ?.filter((assignment) =>
            includesNormalized([assignment.role], Role.LocationManager),
          )
          .map((assignment) => assignment.locationId) ?? []),
      ]),
    ];
    assert(ownLocationIds.length > 0, 'Filialleiter hat keinen eigenen Standort');
    const ownLocationId = ownLocationIds[0];
    const ownLocation = await models.location.findById(ownLocationId).exec();
    assert(ownLocation?.tenantId === tenantId, 'Eigener Standort liegt nicht im Tenant');

    const foreignLocation = await ensureForeignLocation(
      models,
      tenantId,
      ownLocationIds,
    );
    const foreignLocationId = foreignLocation._id.toString();
    const actor = toAuthenticatedUser(login.body.user);

    assert(
      await accessPolicy.canManageLocation(actor, ownLocationId),
      'AccessPolicy erlaubt eigenen Standort nicht',
    );
    assert(
      !(await accessPolicy.canManageLocation(actor, foreignLocationId)),
      'AccessPolicy erlaubt fremden Standort',
    );

    const modules = await request<TenantModuleBody[]>(
      baseUrl,
      'GET',
      '/tenant/modules',
      token,
    );
    assertStatus(modules, 200, 'Tenant-Module laden');
    const enabledModules = modules.body
      .filter((moduleConfig) => moduleConfig.enabled)
      .map((moduleConfig) => moduleConfig.key ?? moduleConfig.moduleKey ?? '');
    for (const moduleKey of requiredModules) {
      assert(
        enabledModules.includes(moduleKey),
        `Pflichtmodul ${moduleKey} ist fuer Frittenwerk Demo nicht aktiv`,
      );
    }

    const routeChecks = await verifyForbiddenRoutes(baseUrl, token);
    const locationChecks = await verifyLocations(
      baseUrl,
      token,
      ownLocationId,
      foreignLocationId,
      tenantId,
    );
    const employeeChecks = await verifyEmployees(
      baseUrl,
      token,
      models,
      tenantId,
      ownLocationId,
      foreignLocationId,
    );
    const shiftChecks = await verifyStaffPlanning(
      baseUrl,
      token,
      ownLocationId,
      foreignLocationId,
      employeeChecks.employeeId,
    );
    const absenceChecks = await verifyAbsences(
      baseUrl,
      token,
      ownLocationId,
      foreignLocationId,
      employeeChecks.employeeId,
    );
    const timeTrackingChecks = await verifyTimeTracking(
      baseUrl,
      token,
      ownLocationId,
      foreignLocationId,
      employeeChecks.employeeId,
      employeeChecks.employeeEmail,
    );
    const orderChecks = await verifyOrdersAndKds(
      baseUrl,
      token,
      models,
      tenantId,
      ownLocationId,
      foreignLocationId,
    );
    const isolationChecks = await verifyLocationIsolation(
      baseUrl,
      token,
      tenantId,
      ownLocationIds,
    );

    await cleanupSmokeData(models, tenantId);

    console.log(
      JSON.stringify(
        {
          login: {
            email: credentials.email,
            tenantId,
            roles: login.body.user.roles ?? [],
            ownLocationIds,
          },
          modules: enabledModules,
          forbiddenRoutes: routeChecks,
          locations: locationChecks,
          employees: employeeChecks,
          staffPlanning: shiftChecks,
          absences: absenceChecks,
          timeTracking: timeTrackingChecks,
          ordersAndKds: orderChecks,
          locationIsolation: isolationChecks,
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
    staffShift: app.get<Model<StaffShiftDocument>>(getModelToken(StaffShift.name)),
    staffAbsence: app.get<Model<StaffAbsenceDocument>>(
      getModelToken(StaffAbsence.name),
    ),
    timeEntry: app.get<Model<TimeEntryDocument>>(getModelToken(TimeEntry.name)),
    order: app.get<Model<OrderDocument>>(getModelToken(Order.name)),
    menuItem: app.get<Model<MenuItemDocument>>(getModelToken(MenuItem.name)),
  };
}

async function cleanupSmokeData(
  models: ReturnType<typeof resolveModels>,
  tenantId: string,
): Promise<void> {
  const smokeUsers = await models.user
    .find({
      tenantId,
      email: /^s4\.smoke\..+@frittenwerk-demo\.demo$/,
    })
    .select('_id')
    .lean()
    .exec();
  const smokeUserIds = smokeUsers.map((user) => user._id.toString());
  const smokeLocations = await models.location
    .find({ tenantId, name: /^S4-Smoke/ })
    .select('_id')
    .lean()
    .exec();
  const smokeLocationIds = smokeLocations.map((location) =>
    location._id.toString(),
  );

  await Promise.all([
    models.staffShift
      .deleteMany({
        tenantId,
        $or: [
          { title: /^S4-Smoke/ },
          { notes: /^S4-Smoke/ },
          { assignedUserIds: { $in: smokeUserIds } },
          { locationId: { $in: smokeLocationIds } },
        ],
      })
      .exec(),
    models.staffAbsence
      .deleteMany({
        tenantId,
        $or: [
          { reason: /^S4-Smoke/ },
          { employeeId: { $in: smokeUserIds } },
          { userId: { $in: smokeUserIds } },
          { locationId: { $in: smokeLocationIds } },
        ],
      })
      .exec(),
    models.timeEntry
      .deleteMany({
        tenantId,
        $or: [
          { notes: /^S4-Smoke/ },
          { employeeId: { $in: smokeUserIds } },
          { locationId: { $in: smokeLocationIds } },
        ],
      })
      .exec(),
    models.order
      .deleteMany({
        tenantId,
        $or: [{ notes: /^S4-Smoke/ }, { locationId: { $in: smokeLocationIds } }],
      })
      .exec(),
    models.assignment.deleteMany({ tenantId, userId: { $in: smokeUserIds } }).exec(),
  ]);

  await models.user.deleteMany({ _id: { $in: smokeUserIds } }).exec();
  await Promise.all([
    models.assignment
      .deleteMany({ tenantId, locationId: { $in: smokeLocationIds } })
      .exec(),
    models.location.deleteMany({ tenantId, _id: { $in: smokeLocationIds } }).exec(),
    models.city.deleteMany({ tenantId, name: /^S4-Smoke/ }).exec(),
    models.region.deleteMany({ tenantId, name: /^S4-Smoke/ }).exec(),
    models.area.deleteMany({ tenantId, name: /^S4-Smoke/ }).exec(),
  ]);
}

async function ensureForeignLocation(
  models: ReturnType<typeof resolveModels>,
  tenantId: string,
  ownLocationIds: string[],
): Promise<LocationDocument> {
  const existingForeign = await models.location
    .findOne({
      tenantId,
      _id: { $nin: ownLocationIds },
      name: { $not: /^S4-Smoke/ },
    })
    .exec();

  if (existingForeign) {
    return existingForeign;
  }

  const suffix = Date.now();
  const area = await models.area.create({
    tenantId,
    name: `S4-Smoke Area ${suffix}`,
    description: 'S4-Smoke Bereich',
    isActive: true,
  });
  const region = await models.region.create({
    tenantId,
    areaId: area._id.toString(),
    name: `S4-Smoke Region ${suffix}`,
    description: 'S4-Smoke Region',
    isActive: true,
  });
  const city = await models.city.create({
    tenantId,
    areaId: area._id.toString(),
    regionId: region._id.toString(),
    name: `S4-Smoke City ${suffix}`,
    description: 'S4-Smoke Stadt',
    isActive: true,
  });

  return models.location.create({
    tenantId,
    areaId: area._id.toString(),
    regionId: region._id.toString(),
    cityId: city._id.toString(),
    name: `S4-Smoke Foreign Location ${suffix}`,
    slug: `s4-smoke-foreign-location-${suffix}`,
    address: 'S4 Teststrasse 2, 50667 Koeln',
    street: 'S4 Teststrasse 2',
    addressLine1: 'S4 Teststrasse 2',
    zip: '50667',
    postalCode: '50667',
    city: 'Koeln',
    cityName: 'Koeln',
    country: 'Deutschland',
    phone: '0221 000004',
    email: `s4.foreign.${suffix}@frittenwerk-demo.demo`,
    isActive: true,
  });
}

async function verifyForbiddenRoutes(baseUrl: string, token: string) {
  const paths = [
    '/platform/tenants',
    '/tenant/areas',
    '/tenant/regions',
    '/tenant/cities',
    '/payroll',
  ];
  const statuses: Record<string, number> = {};

  for (const path of paths) {
    const result = await request<ApiJson>(baseUrl, 'GET', path, token);
    assert(
      [403, 404].includes(result.status),
      `${path} muss fuer Filialleiter blockiert sein, erhalten ${result.status}`,
    );
    statuses[path] = result.status;
  }

  return statuses;
}

async function verifyLocations(
  baseUrl: string,
  token: string,
  ownLocationId: string,
  foreignLocationId: string,
  tenantId: string,
) {
  const list = await request<EntityBody[]>(
    baseUrl,
    'GET',
    '/tenant/locations',
    token,
  );
  assertStatus(list, 200, 'Eigene Standorte laden');
  assert(list.body.length > 0, 'Filialleiter sieht keinen eigenen Standort');
  assert(
    list.body.every((location) => location.tenantId === tenantId),
    'Standortliste enthaelt fremde Tenant-Daten',
  );
  assert(
    list.body.some((location) => location._id === ownLocationId),
    'Eigener Standort fehlt in Standortliste',
  );
  assert(
    !list.body.some((location) => location._id === foreignLocationId),
    'Fremder Standort ist sichtbar',
  );

  const ownDetail = await request<EntityBody>(
    baseUrl,
    'GET',
    `/tenant/locations/${ownLocationId}`,
    token,
  );
  assertStatus(ownDetail, 200, 'Eigenes Standortdetail laden');

  const foreignDetail = await request<ApiJson>(
    baseUrl,
    'GET',
    `/tenant/locations/${foreignLocationId}`,
    token,
  );
  assertStatus(foreignDetail, 404, 'Fremdes Standortdetail blockieren');

  const createLocation = await request<ApiJson>(
    baseUrl,
    'POST',
    '/tenant/locations',
    token,
    {
      areaId: '000000000000000000000001',
      regionId: '000000000000000000000002',
      cityId: '000000000000000000000003',
      name: 'S4-Smoke Forbidden',
      addressLine1: 'S4',
      postalCode: '50667',
      cityName: 'Koeln',
      country: 'Deutschland',
    },
  );
  assertStatus(createLocation, 403, 'Standort erstellen blockieren');

  const patchTenantLocation = await request<ApiJson>(
    baseUrl,
    'PATCH',
    `/tenant/locations/${ownLocationId}`,
    token,
    { phone: '0221 999999' },
  );
  assertStatus(patchTenantLocation, 403, 'Tenant-Standortbearbeitung blockieren');

  const safePatch = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/locations/${ownLocationId}`,
    token,
    {
      phone: '0221 123450',
      email: 'duesseldorf@frittenwerk-demo.demo',
      description: 'S4-Smoke Standortbeschreibung',
      notes: 'S4-Smoke Standortnotiz',
    },
  );
  assertStatus(safePatch, 200, 'Operative Standortfelder bearbeiten');

  const hierarchyPatch = await request<ApiJson>(
    baseUrl,
    'PATCH',
    `/locations/${ownLocationId}`,
    token,
    { areaId: '000000000000000000000001' },
  );
  assert(
    [400, 403].includes(hierarchyPatch.status),
    `Hierarchieaenderung muss blockiert sein (${hierarchyPatch.status})`,
  );

  const deleteLocation = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/tenant/locations/${ownLocationId}`,
    token,
  );
  assertStatus(deleteLocation, 403, 'Standort loeschen blockieren');

  return {
    ownLocationsVisible: list.body.length,
    ownDetailReadable: true,
    foreignLocationHidden: true,
    createDeleteBlocked: true,
    safeOperativePatchAllowed: true,
    hierarchyPatchBlocked: true,
  };
}

async function verifyEmployees(
  baseUrl: string,
  token: string,
  models: ReturnType<typeof resolveModels>,
  tenantId: string,
  ownLocationId: string,
  foreignLocationId: string,
) {
  const suffix = Date.now();
  const passwordHash = await bcrypt.hash('Demo2026!', 12);
  const foreignUser = await models.user.create({
    email: `s4.smoke.foreign.${suffix}@frittenwerk-demo.demo`,
    passwordHash,
    firstName: 'S4',
    lastName: 'Fremdstandort',
    roles: [Role.Staff],
    tenantId,
    locationId: foreignLocationId,
    locationIds: [foreignLocationId],
    managedLocationIds: [],
    isActive: true,
    status: 'active',
    employeeNumber: `S4F${suffix}`,
  });
  await models.assignment.create({
    tenantId,
    userId: foreignUser._id.toString(),
    locationId: foreignLocationId,
    role: Role.Waiter,
    isPrimary: true,
  });

  const employees = await request<EntityBody[]>(
    baseUrl,
    'GET',
    '/employees',
    token,
  );
  assertStatus(employees, 200, 'Mitarbeiter eigener Standorte laden');
  assert(
    employees.body.every((employee) =>
      (employee.locationAssignments ?? []).every(
        (assignment) => assignment.locationId === ownLocationId,
      ),
    ),
    'Mitarbeiterliste enthaelt Zuweisungen fremder Standorte',
  );
  assert(
    !employees.body.some((employee) => employee._id === foreignUser._id.toString()),
    'Mitarbeiter fremder Standorte ist sichtbar',
  );

  const email = `s4.smoke.employee.${suffix}@frittenwerk-demo.demo`;
  const created = await request<EntityBody>(baseUrl, 'POST', '/employees', token, {
    email,
    password: 'Demo2026!',
    firstName: 'S4',
    lastName: 'Filial-Smoke',
    roles: [Role.Staff],
    employeeNumber: `S4${suffix}`,
    locationAssignments: [
      {
        locationId: ownLocationId,
        role: Role.Waiter,
        isPrimary: true,
      },
    ],
    employmentType: 'Teilzeit',
    weeklyHours: 20,
    hourlyRate: 14.5,
    isActive: true,
  });
  assertStatus(created, 201, 'Mitarbeiter im eigenen Standort erstellen');
  assert(created.body.tenantId === tenantId, 'Mitarbeiter wurde falschem Tenant zugeordnet');

  const updated = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/employees/${created.body._id}`,
    token,
    {
      firstName: 'S4 Editiert',
      locationAssignments: [
        {
          locationId: ownLocationId,
          role: Role.Kitchen,
          isPrimary: true,
        },
      ],
    },
  );
  assertStatus(updated, 200, 'Mitarbeiter bearbeiten und Standortrolle aendern');
  assert(
    updated.body.locationAssignments?.[0]?.role === Role.Kitchen,
    'Operative Standortrolle wurde nicht geaendert',
  );

  for (const forbiddenRole of [
    Role.TenantAdmin,
    Role.AreaManager,
    Role.RegionalManager,
    Role.LocationManager,
    Role.PlatformAdmin,
  ]) {
    const forbidden = await request<ApiJson>(
      baseUrl,
      'PATCH',
      `/employees/${created.body._id}`,
      token,
      { roles: [forbiddenRole] },
    );
    assertStatus(forbidden, 403, `Verbotene Rolle ${forbiddenRole} blockieren`);
  }

  const foreignAssignment = await request<ApiJson>(
    baseUrl,
    'PATCH',
    `/employees/${created.body._id}`,
    token,
    {
      locationAssignments: [
        {
          locationId: foreignLocationId,
          role: Role.Waiter,
          isPrimary: true,
        },
      ],
    },
  );
  assertStatus(foreignAssignment, 403, 'Fremden Standort zuweisen blockieren');

  return {
    visibleEmployees: employees.body.length,
    foreignEmployeeHidden: true,
    employeeId: created.body._id,
    employeeEmail: email,
    createEditOwnLocationWorks: true,
    forbiddenRolesBlocked: true,
    foreignAssignmentBlocked: true,
  };
}

async function verifyStaffPlanning(
  baseUrl: string,
  token: string,
  ownLocationId: string,
  foreignLocationId: string,
  employeeId: string,
) {
  const created = await request<EntityBody>(baseUrl, 'POST', '/staff/shifts', token, {
    locationId: ownLocationId,
    roleNeeded: Role.Kitchen,
    title: 'S4-Smoke Filial-Schicht',
    startTime: '2032-01-10T08:00:00.000Z',
    endTime: '2032-01-10T16:00:00.000Z',
    requiredStaffCount: 1,
    assignedUserIds: [employeeId],
    notes: 'S4-Smoke Dienstplanung',
  });
  assertStatus(created, 201, 'Schicht eigener Standort erstellen');

  const day = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/staff/shifts?locationId=${ownLocationId}&start=2032-01-10T00:00:00.000Z&end=2032-01-11T00:00:00.000Z`,
    token,
  );
  assertStatus(day, 200, 'Dienstplanung Tagesansicht eigener Standort');
  assert(day.body.some((shift) => shift._id === created.body._id), 'Tagesansicht fehlt');

  const week = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/staff/shifts?locationId=${ownLocationId}&start=2032-01-09T00:00:00.000Z&end=2032-01-16T00:00:00.000Z`,
    token,
  );
  assertStatus(week, 200, 'Dienstplanung Wochenansicht eigener Standort');

  const employeeView = week.body.filter((shift) =>
    Array.isArray(shift['assignedUserIds'])
      ? (shift['assignedUserIds'] as unknown[]).includes(employeeId)
      : false,
  );
  assert(employeeView.length > 0, 'Mitarbeiteransicht enthaelt Schicht nicht');

  const updated = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/staff/shifts/${created.body._id}`,
    token,
    {
      title: 'S4-Smoke Filial-Schicht bearbeitet',
      startTime: '2032-01-10T09:00:00.000Z',
      endTime: '2032-01-10T17:00:00.000Z',
    },
  );
  assertStatus(updated, 200, 'Schicht eigener Standort bearbeiten');

  const foreignList = await request<ApiJson>(
    baseUrl,
    'GET',
    `/staff/shifts?locationId=${foreignLocationId}`,
    token,
  );
  assertStatus(foreignList, 403, 'Schichten fremder Standort blockieren');

  const foreignCreate = await request<ApiJson>(
    baseUrl,
    'POST',
    '/staff/shifts',
    token,
    {
      locationId: foreignLocationId,
      roleNeeded: Role.Waiter,
      title: 'S4-Smoke Fremdschicht',
      startTime: '2032-01-11T08:00:00.000Z',
      endTime: '2032-01-11T16:00:00.000Z',
      requiredStaffCount: 1,
    },
  );
  assertStatus(foreignCreate, 403, 'Schicht fremder Standort erstellen blockieren');

  const deleted = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/staff/shifts/${created.body._id}`,
    token,
  );
  assertStatus(deleted, 200, 'Schicht eigener Standort loeschen');

  return {
    dayViewWorks: true,
    weekViewWorks: true,
    employeeViewWorks: true,
    createUpdateDeleteOwnWorks: true,
    foreignLocationBlocked: true,
  };
}

async function verifyAbsences(
  baseUrl: string,
  token: string,
  ownLocationId: string,
  foreignLocationId: string,
  employeeId: string,
) {
  const vacation = await request<EntityBody>(baseUrl, 'POST', '/staff/absences', token, {
    employeeId,
    userId: employeeId,
    locationId: ownLocationId,
    type: 'vacation',
    startDate: '2032-02-01T00:00:00.000Z',
    endDate: '2032-02-02T23:59:59.000Z',
    reason: 'S4-Smoke Urlaub',
  });
  assertStatus(vacation, 201, 'Urlaub eigener Standort beantragen');

  const approved = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/staff/absences/${vacation.body._id}/approve`,
    token,
    { managerNote: 'S4-Smoke genehmigt' },
  );
  assertStatus(approved, 200, 'Urlaub eigener Standort genehmigen');

  const sick = await request<EntityBody>(baseUrl, 'POST', '/staff/absences', token, {
    employeeId,
    userId: employeeId,
    locationId: ownLocationId,
    type: 'sick',
    startDate: '2032-03-01T00:00:00.000Z',
    endDate: '2032-03-01T23:59:59.000Z',
    reason: 'S4-Smoke Krankheit',
  });
  assertStatus(sick, 201, 'Krankheit eigener Standort beantragen');

  const rejected = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/staff/absences/${sick.body._id}/reject`,
    token,
    { managerNote: 'S4-Smoke abgelehnt' },
  );
  assertStatus(rejected, 200, 'Krankheit eigener Standort ablehnen');

  const list = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/staff/absences?locationId=${ownLocationId}`,
    token,
  );
  assertStatus(list, 200, 'Abwesenheiten eigener Standort laden');
  assert(
    list.body.some((absence) => absence._id === vacation.body._id),
    'Abwesenheitenliste enthaelt Urlaub nicht',
  );

  const foreignList = await request<ApiJson>(
    baseUrl,
    'GET',
    `/staff/absences?locationId=${foreignLocationId}`,
    token,
  );
  assertStatus(foreignList, 403, 'Abwesenheiten fremder Standort blockieren');

  return {
    ownAbsencesVisible: true,
    approveWorks: true,
    rejectWorks: true,
    foreignAbsencesBlocked: true,
  };
}

async function verifyTimeTracking(
  baseUrl: string,
  managerToken: string,
  ownLocationId: string,
  foreignLocationId: string,
  employeeId: string,
  employeeEmail: string,
) {
  const employeeLogin = await request<LoginBody>(
    baseUrl,
    'POST',
    '/auth/login',
    undefined,
    {
      email: employeeEmail,
      password: 'Demo2026!',
    },
  );
  assertStatus(employeeLogin, 201, 'Smoke-Mitarbeiter Login');
  const employeeToken = employeeLogin.body.accessToken;

  const clockIn = await request<EntityBody>(
    baseUrl,
    'POST',
    '/time-tracking/clock-in',
    employeeToken,
    {
      locationId: ownLocationId,
      notes: 'S4-Smoke Clock-In',
    },
  );
  assertStatus(clockIn, 201, 'Clock In eigener Standort');

  const clockOut = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/time-tracking/${clockIn.body._id}/clock-out`,
    employeeToken,
  );
  assertStatus(clockOut, 200, 'Clock Out eigener Standort');

  const history = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/time-tracking?locationId=${ownLocationId}&employeeId=${employeeId}`,
    managerToken,
  );
  assertStatus(history, 200, 'Zeiterfassung eigener Standort laden');
  assert(
    history.body.some((entry) => entry._id === clockIn.body._id),
    'Zeiterfassung Historie enthaelt Smoke-Eintrag nicht',
  );

  const corrected = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/time-tracking/${clockIn.body._id}/correction`,
    managerToken,
    {
      clockInAt: todayAtIso(8, 0),
      clockOutAt: todayAtIso(16, 0),
      breakMinutes: 5,
      correctionReason: 'S4-Smoke Korrektur',
    },
  );
  assertStatus(corrected, 200, 'Zeiterfassung eigener Standort korrigieren');

  const report = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    `/time-tracking/reports/worktime?locationId=${ownLocationId}&employeeId=${employeeId}&dateFrom=${encodeURIComponent(
      localDateKey(new Date()),
    )}&dateTo=${encodeURIComponent(localDateKey(new Date()))}`,
    managerToken,
  );
  assertStatus(report, 200, 'Zeiterfassung Manager-Report eigener Standort');

  const foreignHistory = await request<ApiJson>(
    baseUrl,
    'GET',
    `/time-tracking?locationId=${foreignLocationId}`,
    managerToken,
  );
  assertStatus(foreignHistory, 403, 'Zeiterfassung fremder Standort blockieren');

  return {
    clockInOutWorks: true,
    historyWorks: true,
    correctionWorks: true,
    managerReportWorks: true,
    foreignLocationBlocked: true,
  };
}

async function verifyOrdersAndKds(
  baseUrl: string,
  token: string,
  models: ReturnType<typeof resolveModels>,
  tenantId: string,
  ownLocationId: string,
  foreignLocationId: string,
) {
  const foreignOrder = await models.order.create({
    tenantId,
    locationId: foreignLocationId,
    orderNumber: `S4-F-${Date.now()}`,
    status: OrderStatus.New,
    items: [
      {
        name: 'S4-Smoke Fremdorder',
        quantity: 1,
        price: 1,
        status: OrderItemStatus.Open,
        isKitchenItem: true,
      },
    ],
    total: 1,
    subtotal: 1,
    tax: 0,
    notes: 'S4-Smoke Fremdorder',
  });

  const order = await request<EntityBody>(baseUrl, 'POST', '/orders', token, {
    locationId: ownLocationId,
    guestCount: 1,
    notes: 'S4-Smoke KDS Aggregation',
    items: [
      {
        name: 'S4-Smoke Burger',
        quantity: 1,
        price: 9.9,
        isKitchenItem: true,
      },
    ],
  });
  assertStatus(order, 201, 'Tischbestellung eigener Standort erstellen');
  assert(order.body.items?.[0]?._id, 'Smoke-Bestellung hat keine Positions-ID');

  const orders = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/orders?locationId=${ownLocationId}`,
    token,
  );
  assertStatus(orders, 200, 'Orders eigener Standort laden');
  assert(orders.body.some((entry) => entry._id === order.body._id), 'Eigene Order fehlt');
  assert(
    !orders.body.some((entry) => entry._id === foreignOrder._id.toString()),
    'Order fremder Standort ist sichtbar',
  );

  const foreignOrders = await request<ApiJson>(
    baseUrl,
    'GET',
    `/orders?locationId=${foreignLocationId}`,
    token,
  );
  assertStatus(foreignOrders, 403, 'Orders fremder Standort blockieren');

  const counterDashboard = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    `/counter/dashboard?locationId=${ownLocationId}`,
    token,
  );
  assertStatus(counterDashboard, 200, 'POS/Theken-Dashboard eigener Standort');

  const menuItem = await models.menuItem
    .findOne({ isActive: { $ne: false } })
    .lean()
    .exec();
  assert(menuItem, 'Kein Menueartikel fuer Counter-Smoke vorhanden');
  const counterOrder = await request<EntityBody>(
    baseUrl,
    'POST',
    '/counter/orders',
    token,
    {
      locationId: ownLocationId,
      customerName: 'S4-Smoke Gast',
      notes: 'S4-Smoke Counter',
      items: [
        {
          menuItemId: menuItem._id.toString(),
          quantity: 1,
          isKitchenItem: Boolean(menuItem.isKitchenItem),
        },
      ],
    },
  );
  assertStatus(counterOrder, 201, 'Thekenbestellung eigener Standort erstellen');

  const foreignCounter = await request<ApiJson>(
    baseUrl,
    'GET',
    `/counter/orders?locationId=${foreignLocationId}`,
    token,
  );
  assertStatus(foreignCounter, 403, 'Thekenbestellungen fremder Standort blockieren');

  const kds = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/kds/orders?locationId=${ownLocationId}`,
    token,
  );
  assertStatus(kds, 200, 'KDS eigener Standort laden');

  const started = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/kds/orders/${order.body._id}/items/${order.body.items[0]._id}/status`,
    token,
    {
      status: 'started',
      employeeName: 'S4 Filialleiter',
    },
  );
  assertStatus(started, 200, 'KDS Item eigener Standort starten');
  assert(
    started.body.status === OrderStatus.Preparing,
    `Orderstatus wurde nach KDS-Start nicht aggregiert (${started.body.status})`,
  );

  const foreignKds = await request<ApiJson>(
    baseUrl,
    'GET',
    `/kds/orders?locationId=${foreignLocationId}`,
    token,
  );
  assertStatus(foreignKds, 403, 'KDS fremder Standort blockieren');

  await request<ApiJson>(baseUrl, 'DELETE', `/orders/${order.body._id}`, token);
  await models.order.deleteOne({ _id: counterOrder.body._id, tenantId }).exec();
  await models.order.deleteOne({ _id: foreignOrder._id, tenantId }).exec();

  return {
    tableOrdersOwnLocationWork: true,
    counterOrdersOwnLocationWork: true,
    kdsOwnLocationWorks: true,
    kdsStatusAggregationWorks: true,
    foreignLocationBlocked: true,
  };
}

async function verifyLocationIsolation(
  baseUrl: string,
  token: string,
  tenantId: string,
  ownLocationIds: string[],
) {
  const locations = await request<EntityBody[]>(baseUrl, 'GET', '/locations', token);
  assertStatus(locations, 200, 'Operative Standorte laden');
  assert(
    locations.body.every(
      (location) =>
        location.tenantId === tenantId && ownLocationIds.includes(location._id),
    ),
    'Operative Standortliste enthaelt fremde Standorte oder Tenants',
  );

  const employees = await request<EntityBody[]>(baseUrl, 'GET', '/employees', token);
  assertStatus(employees, 200, 'Location Isolation Mitarbeiter');
  assertNoForbiddenTenantNames(employees.body, 'Mitarbeiter');
  assert(
    employees.body.every((employee) =>
      (employee.locationAssignments ?? []).every((assignment) =>
        ownLocationIds.includes(assignment.locationId),
      ),
    ),
    'Mitarbeiterliste enthaelt fremde Standortzuweisungen',
  );

  const orders = await request<EntityBody[]>(baseUrl, 'GET', '/orders', token);
  assertStatus(orders, 200, 'Location Isolation Orders');
  assertNoForbiddenTenantNames(orders.body, 'Orders');
  assert(
    orders.body.every((order) => ownLocationIds.includes(order.locationId ?? '')),
    'Orders enthalten fremde Standorte',
  );

  return {
    operativeLocationsScoped: true,
    employeesScoped: true,
    ordersScoped: true,
    forbiddenTenantNamesHidden: true,
  };
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

function toAuthenticatedUser(user: LoginBody['user']): AuthenticatedUser {
  return {
    sub: user._id,
    email: user.email ?? credentials.email,
    roles: user.roles ?? [],
    permissions: user.permissions ?? [],
    tenantId: user.tenantId,
    locationIds: user.locationIds ?? [],
    primaryLocationId: user.locationId,
    locationAssignments: user.locationAssignments ?? [],
    managedLocationIds: user.managedLocationIds ?? [],
    areaIds: [],
    regionIds: [],
    departmentIds: [],
  };
}

function assertNoForbiddenTenantNames(data: unknown, label: string): void {
  const serialized = JSON.stringify(data);
  const visibleNames = forbiddenTenantNames.filter((name) =>
    serialized.includes(name),
  );
  assert(
    visibleNames.length === 0,
    `${label}: Fremdtenant-Daten sichtbar (${visibleNames.join(', ')})`,
  );
}

function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(value.getDate()).padStart(2, '0')}`;
}

function todayAtIso(hours: number, minutes: number): string {
  const value = new Date();
  value.setHours(hours, minutes, 0, 0);

  return value.toISOString();
}

void verifyFrittenwerkLocationManager();
