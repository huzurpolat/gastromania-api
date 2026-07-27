import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { AddressInfo } from 'node:net';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Area, AreaDocument } from '../areas/schemas/area.schema';
import { City, CityDocument } from '../cities/schemas/city.schema';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import {
  COUNTER_ORDERS_MODULE_KEY,
  DIGITAL_MENU_MODULE_KEY,
  KDS_MODULE_KEY,
  PAYROLL_MODULE_KEY,
  POS_MODULE_KEY,
  STAFF_MANAGEMENT_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
  TIME_TRACKING_MODULE_KEY,
} from '../modules/constants/module-definitions';
import { Order, OrderDocument, OrderStatus } from '../orders/schemas/order.schema';
import {
  PayrollPeriod,
  PayrollPeriodDocument,
} from '../payroll/schemas/payroll-period.schema';
import { Region, RegionDocument } from '../regions/schemas/region.schema';
import {
  StaffAbsence,
  StaffAbsenceDocument,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  StaffShift,
  StaffShiftDocument,
} from '../staff-planning/schemas/staff-shift.schema';
import { Tenant, TenantDocument } from './schemas/tenant.schema';
import {
  TimeEntry,
  TimeEntryDocument,
} from '../time-tracking/schemas/time-entry.schema';
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
    tenantId?: string;
    permissions?: string[];
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
  areaId?: string;
  regionId?: string;
  cityId?: string;
  description?: string;
  notes?: string;
  isActive?: boolean;
  locationAssignments?: LocationAssignmentBody[];
  assignedUserIds?: string[];
  items?: OrderItemBody[];
  status?: string;
  kpis?: Record<string, unknown>;
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

interface PayrollExportBody {
  filename?: string;
  mimeType?: string;
  content?: string;
}

type ApiJson = Record<string, unknown> | Record<string, unknown>[];

const credentials = {
  email: 'admin@frittenwerk-demo.demo',
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
  PAYROLL_MODULE_KEY,
];

const forbiddenTenantNames = [
  'BurgerMania',
  'Crispy Chicken',
  'Pasta House',
  'Grill Factory',
  'Demo Test Tenant',
];

async function verifyFrittenwerkTenantAdmin() {
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
    assertStatus(login, 201, 'Tenant Admin Login');
    assert(
      login.body.user.tenantId === tenantId,
      'Tenant Admin Login hat falschen Tenant-Kontext',
    );
    assert(
      includesNormalized(login.body.user.roles, 'TenantAdmin'),
      'Tenant Admin Login liefert keine TenantAdmin-Rolle',
    );
    assert(
      !includesNormalized(login.body.user.roles, 'PlatformAdmin'),
      'Tenant Admin darf keine PlatformAdmin-Rolle besitzen',
    );
    const token = login.body.accessToken;

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

    const dashboardChecks = await verifyDashboard(baseUrl, token);
    const organizationChecks = await verifyOrganization(baseUrl, token, tenantId);
    const employeeChecks = await verifyEmployees(
      baseUrl,
      token,
      tenantId,
      organizationChecks.primaryLocationId,
      organizationChecks.secondaryLocationId,
    );
    const staffPlanningChecks = await verifyStaffPlanning(
      baseUrl,
      token,
      tenantId,
      organizationChecks.primaryLocationId,
      employeeChecks.employeeId,
    );
    const absenceChecks = await verifyAbsences(
      baseUrl,
      token,
      tenantId,
      organizationChecks.primaryLocationId,
      employeeChecks.employeeId,
    );
    const timeTrackingChecks = await verifyTimeTracking(
      baseUrl,
      token,
      tenantId,
      organizationChecks.primaryLocationId,
      employeeChecks.employeeId,
      employeeChecks.employeeEmail,
      absenceChecks.approvedAbsenceId,
    );
    const payrollChecks = await verifyPayroll(
      baseUrl,
      token,
      organizationChecks.primaryLocationId,
      employeeChecks.employeeId,
    );
    const orderChecks = await verifyOrdersAndKds(
      baseUrl,
      token,
      organizationChecks.primaryLocationId,
    );
    const isolationChecks = await verifyTenantIsolation(baseUrl, token, tenantId);

    await cleanupSmokeData(models, tenantId);

    console.log(
      JSON.stringify(
        {
          login: {
            email: credentials.email,
            tenantId,
            roles: login.body.user.roles ?? [],
          },
          modules: enabledModules,
          dashboard: dashboardChecks,
          organization: organizationChecks,
          employees: employeeChecks,
          staffPlanning: staffPlanningChecks,
          timeTracking: timeTrackingChecks,
          absences: absenceChecks,
          payroll: payrollChecks,
          ordersAndKds: orderChecks,
          tenantIsolation: isolationChecks,
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
    payrollPeriod: app.get<Model<PayrollPeriodDocument>>(
      getModelToken(PayrollPeriod.name),
    ),
    order: app.get<Model<OrderDocument>>(getModelToken(Order.name)),
  };
}

async function cleanupSmokeData(
  models: ReturnType<typeof resolveModels>,
  tenantId: string,
): Promise<void> {
  const smokeUsers = await models.user
    .find({
      tenantId,
      email: /^s3a\.smoke\..+@frittenwerk-demo\.demo$/,
    })
    .select('_id')
    .lean()
    .exec();
  const smokeUserIds = smokeUsers.map((user) => user._id.toString());

  await Promise.all([
    models.staffShift
      .deleteMany({
        tenantId,
        $or: [
          { title: /^S3A-Smoke/ },
          { notes: /^S3A-Smoke/ },
          { assignedUserIds: { $in: smokeUserIds } },
        ],
      })
      .exec(),
    models.staffAbsence
      .deleteMany({
        tenantId,
        $or: [
          { reason: /^S3A-Smoke/ },
          { employeeId: { $in: smokeUserIds } },
          { userId: { $in: smokeUserIds } },
        ],
      })
      .exec(),
    models.timeEntry
      .deleteMany({
        tenantId,
        $or: [{ notes: /^S3A-Smoke/ }, { employeeId: { $in: smokeUserIds } }],
      })
      .exec(),
    models.payrollPeriod
      .deleteMany({ tenantId, employeeId: { $in: smokeUserIds } })
      .exec(),
    models.order
      .deleteMany({ tenantId, notes: /^S3A-Smoke/ })
      .exec(),
    models.assignment.deleteMany({ tenantId, userId: { $in: smokeUserIds } }).exec(),
  ]);

  await models.user.deleteMany({ _id: { $in: smokeUserIds } }).exec();

  const smokeLocations = await models.location
    .find({ tenantId, name: /^S3A-Smoke/ })
    .select('_id')
    .lean()
    .exec();
  const smokeLocationIds = smokeLocations.map((location) =>
    location._id.toString(),
  );

  await Promise.all([
    models.assignment
      .deleteMany({ tenantId, locationId: { $in: smokeLocationIds } })
      .exec(),
    models.location.deleteMany({ tenantId, _id: { $in: smokeLocationIds } }).exec(),
    models.city.deleteMany({ tenantId, name: /^S3A-Smoke/ }).exec(),
    models.region.deleteMany({ tenantId, name: /^S3A-Smoke/ }).exec(),
    models.area.deleteMany({ tenantId, name: /^S3A-Smoke/ }).exec(),
  ]);
}

async function verifyDashboard(baseUrl: string, token: string) {
  const overview = await request<EntityBody>(
    baseUrl,
    'GET',
    '/dashboard/overview',
    token,
  );
  const sales = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    '/dashboard/sales',
    token,
  );
  const orders = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    '/dashboard/orders',
    token,
  );
  const inventory = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    '/dashboard/inventory',
    token,
  );
  const employees = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    '/dashboard/employees',
    token,
  );
  const finance = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    '/dashboard/finance',
    token,
  );
  const notifications = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    '/dashboard/notifications',
    token,
  );

  for (const [label, result] of Object.entries({
    overview,
    sales,
    orders,
    inventory,
    employees,
    finance,
    notifications,
  })) {
    assertStatus(result, 200, `Dashboard ${label}`);
  }

  const overviewKpis = overview.body.kpis ?? {};
  const positiveKpis = extractPositiveNumbers(overviewKpis);
  assert(
    positiveKpis.length > 0,
    'Dashboard Overview liefert trotz Demo-Daten keine positiven KPIs',
  );

  const ordersNumbers = extractPositiveNumbers(orders.body);
  assert(
    ordersNumbers.length > 0,
    'Dashboard Orders liefert trotz Demo-Bestellungen keine positiven Werte',
  );

  const employeeNumbers = extractPositiveNumbers(employees.body);
  assert(
    employeeNumbers.length > 0,
    'Dashboard Employees liefert trotz Demo-Personal keine positiven Werte',
  );

  return {
    overviewPositiveKpis: positiveKpis.length,
    ordersPositiveValues: ordersNumbers.length,
    employeesPositiveValues: employeeNumbers.length,
    financeKeys: Object.keys(finance.body).length,
    notificationsLoaded: true,
  };
}

async function verifyOrganization(
  baseUrl: string,
  token: string,
  tenantId: string,
) {
  const areas = await request<EntityBody[]>(
    baseUrl,
    'GET',
    '/tenant/areas?includeRegions=true',
    token,
  );
  const regions = await request<EntityBody[]>(
    baseUrl,
    'GET',
    '/tenant/regions',
    token,
  );
  const cities = await request<EntityBody[]>(
    baseUrl,
    'GET',
    '/tenant/cities',
    token,
  );
  const locations = await request<EntityBody[]>(
    baseUrl,
    'GET',
    '/tenant/locations',
    token,
  );

  for (const [label, result] of Object.entries({
    areas,
    regions,
    cities,
    locations,
  })) {
    assertStatus(result, 200, `Organisation ${label} Liste`);
    assert(Array.isArray(result.body), `Organisation ${label} Antwort ist keine Liste`);
    assert(result.body.length > 0, `Organisation ${label} Liste ist leer`);
    assertTenantScope(result.body, tenantId, `Organisation ${label}`);
    assertNoForbiddenTenantNames(result.body, `Organisation ${label}`);
  }

  const primaryLocation = locations.body[0];
  const secondaryLocation = locations.body[1] ?? locations.body[0];
  assert(primaryLocation._id, 'Kein primaerer Standort vorhanden');
  assert(secondaryLocation._id, 'Kein zweiter Standort vorhanden');

  const suffix = Date.now();
  const areaA = await request<EntityBody>(baseUrl, 'POST', '/tenant/areas', token, {
    name: `S3A-Smoke Area A ${suffix}`,
    description: 'S3A-Smoke Bereich Beschreibung',
    notes: 'S3A-Smoke Bereich Notiz',
    isActive: true,
  });
  assertStatus(areaA, 201, 'Bereich erstellen');
  assert(areaA.body.tenantId === tenantId, 'Bereich wurde nicht tenantgebunden erstellt');

  const areaB = await request<EntityBody>(baseUrl, 'POST', '/tenant/areas', token, {
    name: `S3A-Smoke Area B ${suffix}`,
    isActive: true,
  });
  assertStatus(areaB, 201, 'Zweiter Bereich erstellen');

  const patchedArea = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/tenant/areas/${areaA.body._id}`,
    token,
    {
      description: 'S3A-Smoke Bereich Beschreibung aktualisiert',
      notes: 'S3A-Smoke Bereich Notiz aktualisiert',
    },
  );
  assertStatus(patchedArea, 200, 'Bereich Beschreibung/Notizen speichern');
  assert(
    patchedArea.body.description?.includes('aktualisiert') &&
      patchedArea.body.notes?.includes('aktualisiert'),
    'Bereich Beschreibung oder Notizen wurden nicht gespeichert',
  );

  const regionA = await request<EntityBody>(
    baseUrl,
    'POST',
    '/tenant/regions',
    token,
    {
      areaId: areaA.body._id,
      name: `S3A-Smoke Region A ${suffix}`,
      description: 'S3A-Smoke Region Beschreibung',
      notes: 'S3A-Smoke Region Notiz',
      isActive: true,
    },
  );
  assertStatus(regionA, 201, 'Region erstellen');

  const regionB = await request<EntityBody>(
    baseUrl,
    'POST',
    '/tenant/regions',
    token,
    {
      areaId: areaB.body._id,
      name: `S3A-Smoke Region B ${suffix}`,
      isActive: true,
    },
  );
  assertStatus(regionB, 201, 'Zweite Region erstellen');

  const filteredRegions = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/tenant/regions?areaId=${areaA.body._id}`,
    token,
  );
  assertStatus(filteredRegions, 200, 'Regionen nach Bereich filtern');
  assert(
    filteredRegions.body.some((region) => region._id === regionA.body._id),
    'Regionenfilter enthaelt die Region des gewaehlten Bereichs nicht',
  );
  assert(
    !filteredRegions.body.some((region) => region._id === regionB.body._id),
    'Regionenfilter enthaelt Region aus falschem Bereich',
  );

  const invalidCity = await request<ApiJson>(
    baseUrl,
    'POST',
    '/tenant/cities',
    token,
    {
      areaId: areaA.body._id,
      regionId: regionB.body._id,
      name: `S3A-Smoke Ungueltig ${suffix}`,
    },
  );
  assertStatus(invalidCity, 400, 'Stadt mit falscher Bereich/Region-Kombination');

  const city = await request<EntityBody>(baseUrl, 'POST', '/tenant/cities', token, {
    areaId: areaA.body._id,
    regionId: regionA.body._id,
    name: `S3A-Smoke City ${suffix}`,
    description: 'S3A-Smoke Stadt Beschreibung',
    notes: 'S3A-Smoke Stadt Notiz',
    isActive: true,
  });
  assertStatus(city, 201, 'Stadt erstellen');

  const filteredCities = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/tenant/cities?areaId=${areaA.body._id}&regionId=${regionA.body._id}`,
    token,
  );
  assertStatus(filteredCities, 200, 'Staedte nach Bereich/Region filtern');
  assert(
    filteredCities.body.some((entry) => entry._id === city.body._id),
    'Stadtfilter enthaelt erstellte Stadt nicht',
  );

  const location = await request<EntityBody>(
    baseUrl,
    'POST',
    '/tenant/locations',
    token,
    {
      areaId: areaA.body._id,
      regionId: regionA.body._id,
      cityId: city.body._id,
      name: `S3A-Smoke Location ${suffix}`,
      description: 'S3A-Smoke Standort Beschreibung',
      notes: 'S3A-Smoke Standort Notiz',
      addressLine1: 'S3A Teststrasse 1',
      postalCode: '50667',
      cityName: 'Koeln',
      country: 'Deutschland',
      phone: '0221 000000',
      email: `s3a.location.${suffix}@frittenwerk-demo.demo`,
      taxNumber: `S3A-${suffix}`,
      isActive: true,
    },
  );
  assertStatus(location, 201, 'Standort erstellen');

  const patchedLocation = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/tenant/locations/${location.body._id}`,
    token,
    {
      description: 'S3A-Smoke Standort Beschreibung aktualisiert',
      notes: 'S3A-Smoke Standort Notiz aktualisiert',
      phone: '0221 000001',
    },
  );
  assertStatus(patchedLocation, 200, 'Standort bearbeiten');
  assert(
    patchedLocation.body.description?.includes('aktualisiert') &&
      patchedLocation.body.notes?.includes('aktualisiert'),
    'Standort Beschreibung oder Notizen wurden nicht gespeichert',
  );

  const locationDetail = await request<EntityBody>(
    baseUrl,
    'GET',
    `/tenant/locations/${location.body._id}`,
    token,
  );
  assertStatus(locationDetail, 200, 'Standort Detail laden');
  assert(
    locationDetail.body.areaId === areaA.body._id &&
      locationDetail.body.regionId === regionA.body._id &&
      locationDetail.body.cityId === city.body._id,
    'Standort-Hierarchie ist falsch gespeichert',
  );

  const deleteLocation = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/tenant/locations/${location.body._id}`,
    token,
  );
  assertStatus(deleteLocation, 409, 'Smoke-Standort mit Tischen blockieren');
  const forceDeleteLocation = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/tenant/locations/${location.body._id}?force=true`,
    token,
  );
  assertStatus(forceDeleteLocation, 200, 'Smoke-Standort mit Tischen force-loeschen');
  await assertDeleted(baseUrl, token, `/tenant/locations/${location.body._id}`, 'Standort');

  const deleteCity = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/tenant/cities/${city.body._id}`,
    token,
  );
  assertStatus(deleteCity, 200, 'Smoke-Stadt loeschen');

  const deleteRegionA = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/tenant/regions/${regionA.body._id}`,
    token,
  );
  assertStatus(deleteRegionA, 200, 'Smoke-Region A loeschen');
  const deleteRegionB = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/tenant/regions/${regionB.body._id}`,
    token,
  );
  assertStatus(deleteRegionB, 200, 'Smoke-Region B loeschen');

  const deleteAreaA = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/tenant/areas/${areaA.body._id}`,
    token,
  );
  assertStatus(deleteAreaA, 200, 'Smoke-Bereich A loeschen');
  const deleteAreaB = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/tenant/areas/${areaB.body._id}`,
    token,
  );
  assertStatus(deleteAreaB, 200, 'Smoke-Bereich B loeschen');

  return {
    existingAreas: areas.body.length,
    existingRegions: regions.body.length,
    existingCities: cities.body.length,
    existingLocations: locations.body.length,
    primaryLocationId: primaryLocation._id,
    secondaryLocationId: secondaryLocation._id,
    regionFilterWorks: true,
    invalidCityCombinationRejected: true,
    smokeCrudWorks: true,
  };
}

async function verifyEmployees(
  baseUrl: string,
  token: string,
  tenantId: string,
  primaryLocationId: string,
  secondaryLocationId: string,
) {
  const employees = await request<EntityBody[]>(
    baseUrl,
    'GET',
    '/employees',
    token,
  );
  assertStatus(employees, 200, 'Mitarbeiterliste laden');
  assert(employees.body.length > 0, 'Mitarbeiterliste ist leer');
  assertTenantScope(employees.body, tenantId, 'Mitarbeiterliste');
  assertNoForbiddenTenantNames(employees.body, 'Mitarbeiterliste');

  const suffix = Date.now();
  const email = `s3a.smoke.${suffix}@frittenwerk-demo.demo`;
  const created = await request<EntityBody>(baseUrl, 'POST', '/employees', token, {
    email,
    password: 'Demo2026!',
    firstName: 'S3A',
    lastName: 'Smoke',
    roles: ['STAFF'],
    employmentType: 'Teilzeit',
    contractType: 'Teilzeit',
    hourlyRate: 15.75,
    locationAssignments: [
      {
        locationId: primaryLocationId,
        role: 'WAITER',
        isPrimary: true,
      },
    ],
    isActive: true,
    status: 'active',
  });
  assertStatus(created, 201, 'Mitarbeiter erstellen');
  assert(created.body.tenantId === tenantId, 'Mitarbeiter wurde falschem Tenant zugeordnet');
  assert(
    created.body.locationAssignments?.some(
      (assignment) =>
        assignment.locationId === primaryLocationId &&
        assignment.role === 'WAITER' &&
        assignment.isPrimary === true,
    ),
    'Primaere Standortzuordnung wurde beim Erstellen nicht gespeichert',
  );

  const detail = await request<EntityBody>(
    baseUrl,
    'GET',
    `/employees/${created.body._id}`,
    token,
  );
  assertStatus(detail, 200, 'Mitarbeiter Detail laden');
  assert(
    detail.body.locationAssignments?.length === 1,
    'Mitarbeiter Detail zeigt Standortzuordnungen nicht korrekt',
  );

  const updated = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/employees/${created.body._id}`,
    token,
    {
      firstName: 'S3A Bearbeitet',
      locationAssignments: [
        {
          locationId: primaryLocationId,
          role: 'KITCHEN',
          isPrimary: true,
        },
        {
          locationId: secondaryLocationId,
          role: 'CASHIER',
          isPrimary: false,
        },
      ],
    },
  );
  assertStatus(updated, 200, 'Mitarbeiter bearbeiten und Standort hinzufuegen');
  assert(
    updated.body.locationAssignments?.some(
      (assignment) =>
        assignment.locationId === primaryLocationId && assignment.role === 'KITCHEN',
    ),
    'Standortrolle wurde nicht geaendert',
  );
  assert(
    updated.body.locationAssignments?.some(
      (assignment) =>
        assignment.locationId === secondaryLocationId && assignment.role === 'CASHIER',
    ),
    'Zweiter Standort wurde nicht hinzugefuegt',
  );

  const removedSecondary = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/employees/${created.body._id}`,
    token,
    {
      locationAssignments: [
        {
          locationId: primaryLocationId,
          role: 'WAITER',
          isPrimary: true,
        },
      ],
    },
  );
  assertStatus(removedSecondary, 200, 'Mitarbeiter Standort entfernen');
  assert(
    removedSecondary.body.locationAssignments?.length === 1 &&
      removedSecondary.body.locationAssignments[0]?.locationId === primaryLocationId &&
      removedSecondary.body.locationAssignments[0]?.role === 'WAITER' &&
      removedSecondary.body.locationAssignments[0]?.isPrimary === true,
    'Standort entfernen oder Primärstandort setzen fehlgeschlagen',
  );

  return {
    existingEmployees: employees.body.length,
    employeeId: created.body._id,
    employeeEmail: email,
    createEditAssignmentRolePrimaryWorks: true,
  };
}

async function verifyStaffPlanning(
  baseUrl: string,
  token: string,
  tenantId: string,
  locationId: string,
  employeeId: string,
) {
  const start = '2031-01-13T08:00:00.000Z';
  const end = '2031-01-13T16:00:00.000Z';
  const created = await request<EntityBody>(baseUrl, 'POST', '/staff/shifts', token, {
    locationId,
    roleNeeded: 'WAITER',
    title: 'S3A-Smoke Fruehschicht',
    startTime: start,
    endTime: end,
    requiredStaffCount: 1,
    assignedUserIds: [employeeId],
    notes: 'S3A-Smoke Dienstplanung',
  });
  assertStatus(created, 201, 'Schicht erstellen');
  assert(created.body.tenantId === tenantId, 'Schicht wurde falschem Tenant zugeordnet');

  const dayView = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/staff/shifts?locationId=${locationId}&start=2031-01-13T00:00:00.000Z&end=2031-01-14T00:00:00.000Z`,
    token,
  );
  assertStatus(dayView, 200, 'Dienstplanung Tagesansicht');
  assert(
    dayView.body.some((shift) => shift._id === created.body._id),
    'Tagesansicht enthaelt erstellte Schicht nicht',
  );

  const weekView = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/staff/shifts?locationId=${locationId}&start=2031-01-12T00:00:00.000Z&end=2031-01-19T00:00:00.000Z`,
    token,
  );
  assertStatus(weekView, 200, 'Dienstplanung Wochenansicht');
  assert(
    weekView.body.some((shift) => shift._id === created.body._id),
    'Wochenansicht enthaelt erstellte Schicht nicht',
  );

  const employeeView = weekView.body.filter((shift) =>
    Array.isArray(shift['assignedUserIds'])
      ? (shift['assignedUserIds'] as unknown[]).includes(employeeId)
      : false,
  );
  assert(employeeView.length > 0, 'Mitarbeiteransicht findet zugewiesene Schicht nicht');

  const updated = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/staff/shifts/${created.body._id}`,
    token,
    {
      title: 'S3A-Smoke Spaetschicht',
      startTime: '2031-01-13T09:00:00.000Z',
      endTime: '2031-01-13T17:00:00.000Z',
      notes: 'S3A-Smoke Dienstplanung bearbeitet',
    },
  );
  assertStatus(updated, 200, 'Schicht bearbeiten');
  assert(updated.body.name !== 'S3A-Smoke Fruehschicht', 'Schicht wurde nicht bearbeitet');

  const deleted = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/staff/shifts/${created.body._id}`,
    token,
  );
  assertStatus(deleted, 200, 'Schicht loeschen');

  return {
    shiftCreated: true,
    dayViewWorks: true,
    weekViewWorks: true,
    employeeViewWorks: true,
    shiftUpdatedAndDeleted: true,
  };
}

async function verifyAbsences(
  baseUrl: string,
  token: string,
  tenantId: string,
  locationId: string,
  employeeId: string,
) {
  const todayDate = localDateKey(new Date());
  const approvedVacation = await request<EntityBody>(
    baseUrl,
    'POST',
    '/staff/absences',
    token,
    {
      employeeId,
      userId: employeeId,
      locationId,
      type: 'vacation',
      startDate: `${todayDate}T00:00:00.000Z`,
      endDate: `${todayDate}T23:59:59.000Z`,
      reason: 'S3A-Smoke Urlaub',
    },
  );
  assertStatus(approvedVacation, 201, 'Urlaub beantragen');
  assert(
    approvedVacation.body.tenantId === tenantId,
    'Abwesenheit wurde falschem Tenant zugeordnet',
  );

  const approved = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/staff/absences/${approvedVacation.body._id}/approve`,
    token,
    { managerNote: 'S3A-Smoke Urlaub genehmigt' },
  );
  assertStatus(approved, 200, 'Urlaub genehmigen');
  assert(approved.body.status === 'approved', 'Urlaub wurde nicht genehmigt');

  const sick = await request<EntityBody>(baseUrl, 'POST', '/staff/absences', token, {
    employeeId,
    userId: employeeId,
    locationId,
    type: 'sick',
    startDate: '2031-02-02T00:00:00.000Z',
    endDate: '2031-02-03T23:59:59.000Z',
    reason: 'S3A-Smoke Krankheit',
  });
  assertStatus(sick, 201, 'Krankheit beantragen');

  const rejected = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/staff/absences/${sick.body._id}/reject`,
    token,
    { managerNote: 'S3A-Smoke Krankheit abgelehnt' },
  );
  assertStatus(rejected, 200, 'Krankheit ablehnen');
  assert(rejected.body.status === 'rejected', 'Krankheit wurde nicht abgelehnt');

  const list = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/staff/absences?employeeId=${employeeId}`,
    token,
  );
  assertStatus(list, 200, 'Abwesenheiten Liste');
  assert(
    list.body.some((absence) => absence._id === approvedVacation.body._id) &&
      list.body.some((absence) => absence._id === sick.body._id),
    'Abwesenheitenliste enthaelt Smoke-Antraege nicht',
  );

  return {
    approvedAbsenceId: approvedVacation.body._id,
    vacationRequestedApproved: true,
    sicknessRequestedRejected: true,
    absenceListWorks: true,
    shiftConflictFieldPresent:
      'hasShiftConflicts' in approved.body || 'shiftConflictCount' in approved.body,
  };
}

async function verifyTimeTracking(
  baseUrl: string,
  managerToken: string,
  tenantId: string,
  locationId: string,
  employeeId: string,
  employeeEmail: string,
  approvedAbsenceId: string,
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
  assertStatus(employeeLogin, 201, 'Smoke-Mitarbeiter Login fuer Zeiterfassung');
  assert(
    employeeLogin.body.user._id === employeeId,
    'Smoke-Mitarbeiter Login liefert falschen Benutzer',
  );
  const employeeToken = employeeLogin.body.accessToken;

  const blockedClockIn = await request<ApiJson>(
    baseUrl,
    'POST',
    '/time-tracking/clock-in',
    employeeToken,
    {
      locationId,
      notes: 'S3A-Smoke Clock-In Blocktest',
    },
  );
  assert(
    blockedClockIn.status === 400 || blockedClockIn.status === 409,
    `Clock-In wurde trotz genehmigtem Urlaub nicht blockiert (${blockedClockIn.status})`,
  );

  const cancelled = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/staff/absences/${approvedAbsenceId}/cancel`,
    managerToken,
  );
  assertStatus(cancelled, 200, 'Genehmigten Urlaub stornieren');
  assert(cancelled.body.status === 'cancelled', 'Urlaub wurde nicht storniert');

  const clockIn = await request<EntityBody>(
    baseUrl,
    'POST',
    '/time-tracking/clock-in',
    employeeToken,
    {
      locationId,
      notes: 'S3A-Smoke Clock-In',
    },
  );
  assertStatus(clockIn, 201, 'Clock In');
  assert(clockIn.body.tenantId === tenantId, 'Zeiteintrag wurde falschem Tenant zugeordnet');

  const startBreak = await request<EntityBody>(
    baseUrl,
    'POST',
    `/time-tracking/${clockIn.body._id}/breaks/start`,
    employeeToken,
    { notes: 'S3A-Smoke Pause Start' },
  );
  assertStatus(startBreak, 201, 'Pause starten');

  const endBreak = await request<EntityBody>(
    baseUrl,
    'POST',
    `/time-tracking/${clockIn.body._id}/breaks/end`,
    employeeToken,
    { notes: 'S3A-Smoke Pause Ende' },
  );
  assertStatus(endBreak, 201, 'Pause beenden');

  const breaks = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/time-tracking/${clockIn.body._id}/breaks`,
    employeeToken,
  );
  assertStatus(breaks, 200, 'Pausen Historie');
  assert(breaks.body.length > 0, 'Pausen Historie ist leer');

  const clockOut = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/time-tracking/${clockIn.body._id}/clock-out`,
    employeeToken,
  );
  assertStatus(clockOut, 200, 'Clock Out');
  assert(clockOut.body.status === 'closed', 'Clock Out hat Zeiteintrag nicht geschlossen');

  const history = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/time-tracking?locationId=${locationId}&employeeId=${employeeId}`,
    managerToken,
  );
  assertStatus(history, 200, 'Zeiterfassung Historie');
  assert(
    history.body.some((entry) => entry._id === clockIn.body._id),
    'Zeiterfassung Historie enthaelt Smoke-Eintrag nicht',
  );

  const worktime = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    `/time-tracking/reports/worktime?locationId=${locationId}&employeeId=${employeeId}&dateFrom=${encodeURIComponent(
      localDateKey(new Date()),
    )}&dateTo=${encodeURIComponent(localDateKey(new Date()))}`,
    managerToken,
  );
  assertStatus(worktime, 200, 'Zeiterfassung Manager-Report');

  return {
    approvedVacationBlocksClockIn: true,
    clockInOutWorks: true,
    breakStartEndWorks: true,
    historyWorks: true,
    managerFiltersWork: true,
  };
}

async function verifyPayroll(
  baseUrl: string,
  token: string,
  locationId: string,
  employeeId: string,
) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const query = `locationId=${locationId}&employeeId=${employeeId}&start=${encodeURIComponent(
    start.toISOString(),
  )}&end=${encodeURIComponent(end.toISOString())}`;
  const summary = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    `/payroll/summary?${query}`,
    token,
  );
  assertStatus(summary, 200, 'Payroll Summary');
  assert(
    extractPositiveNumbers(summary.body).length > 0,
    'Payroll Summary enthaelt trotz Zeiteintrag keine positiven Werte',
  );

  const periods = await request<Record<string, unknown>[]>(
    baseUrl,
    'GET',
    `/payroll/periods?${query}`,
    token,
  );
  assertStatus(periods, 200, 'Payroll Perioden');

  const exported = await request<PayrollExportBody>(
    baseUrl,
    'GET',
    `/payroll/export?format=csv&${query}`,
    token,
  );
  assertStatus(exported, 200, 'Payroll CSV Export');
  assert(
    exported.body.mimeType?.includes('csv') && Boolean(exported.body.content),
    'Payroll CSV Export liefert keinen CSV-Inhalt',
  );

  const locked = await request<EntityBody>(
    baseUrl,
    'POST',
    '/payroll/periods/lock',
    token,
    {
      locationId,
      employeeId,
      start: start.toISOString(),
      end: end.toISOString(),
    },
  );
  assertStatus(locked, 201, 'Payroll Periode locken');

  return {
    summaryWorks: true,
    periodsWorks: true,
    csvExportWorks: true,
    lockWorks: true,
  };
}

async function verifyOrdersAndKds(
  baseUrl: string,
  token: string,
  locationId: string,
) {
  const todayOrdersBefore = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/orders/today?locationId=${locationId}`,
    token,
  );
  assertStatus(todayOrdersBefore, 200, 'Tischbestellungen heute');

  const order = await request<EntityBody>(baseUrl, 'POST', '/orders', token, {
    locationId,
    guestCount: 1,
    notes: 'S3A-Smoke KDS Aggregation',
    items: [
      {
        name: 'S3A-Smoke Burger',
        quantity: 1,
        price: 9.9,
        isKitchenItem: true,
      },
      {
        name: 'S3A-Smoke Pommes',
        quantity: 1,
        price: 3.9,
        isKitchenItem: true,
      },
    ],
  });
  assertStatus(order, 201, 'Tischbestellung erstellen');
  assert(order.body._id, 'Smoke-Bestellung hat keine ID');
  assert(order.body.items?.[0]?._id, 'Smoke-Bestellung hat keine Positions-ID');

  const ordersAfter = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/orders/today?locationId=${locationId}`,
    token,
  );
  assertStatus(ordersAfter, 200, 'Tischbestellungen nach Create');
  assert(
    ordersAfter.body.some((entry) => entry._id === order.body._id),
    'Smoke-Bestellung ist nicht in heutigen Tischbestellungen sichtbar',
  );
  assertNoForbiddenTenantNames(ordersAfter.body, 'Tischbestellungen');

  const counterDashboard = await request<Record<string, unknown>>(
    baseUrl,
    'GET',
    `/counter/dashboard?locationId=${locationId}`,
    token,
  );
  assertStatus(counterDashboard, 200, 'Theken-Dashboard');

  const counterOrders = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/counter/orders?locationId=${locationId}`,
    token,
  );
  assertStatus(counterOrders, 200, 'Thekenbestellungen Liste');
  assertNoForbiddenTenantNames(counterOrders.body, 'Thekenbestellungen');

  const kdsOrders = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/kds/orders?locationId=${locationId}`,
    token,
  );
  assertStatus(kdsOrders, 200, 'KDS Orders');

  const started = await request<EntityBody>(
    baseUrl,
    'PATCH',
    `/kds/orders/${order.body._id}/items/${order.body.items[0]._id}/status`,
    token,
    {
      status: 'started',
      employeeName: 'S3A Smoke',
    },
  );
  assertStatus(started, 200, 'KDS Item starten');
  assert(
    started.body.status === OrderStatus.Preparing,
    `Orderstatus wurde nach Item-Start nicht aggregiert (${started.body.status})`,
  );

  const activeKds = await request<EntityBody[]>(
    baseUrl,
    'GET',
    `/kds/orders/active?locationId=${locationId}`,
    token,
  );
  assertStatus(activeKds, 200, 'KDS aktive Orders');
  assert(
    activeKds.body.some((entry) => entry._id === order.body._id),
    'Gestartete Smoke-Bestellung ist nicht im KDS sichtbar',
  );

  const deleted = await request<ApiJson>(
    baseUrl,
    'DELETE',
    `/orders/${order.body._id}`,
    token,
  );
  assertStatus(deleted, 200, 'Smoke-Bestellung loeschen');

  return {
    existingOrdersTodayBefore: todayOrdersBefore.body.length,
    orderCreateWorks: true,
    counterDashboardWorks: true,
    counterOrdersWorks: true,
    kdsListWorks: true,
    itemStartAggregatesOrder: true,
  };
}

async function verifyTenantIsolation(
  baseUrl: string,
  token: string,
  tenantId: string,
) {
  const platformTenants = await request<ApiJson>(
    baseUrl,
    'GET',
    '/platform/tenants',
    token,
  );
  assertStatus(platformTenants, 403, 'Tenant Admin Platform-Tenants blockieren');

  const areas = await request<EntityBody[]>(baseUrl, 'GET', '/tenant/areas', token);
  const regions = await request<EntityBody[]>(
    baseUrl,
    'GET',
    '/tenant/regions',
    token,
  );
  const cities = await request<EntityBody[]>(baseUrl, 'GET', '/tenant/cities', token);
  const locations = await request<EntityBody[]>(
    baseUrl,
    'GET',
    '/tenant/locations',
    token,
  );
  const employees = await request<EntityBody[]>(baseUrl, 'GET', '/employees', token);

  for (const [label, result] of Object.entries({
    areas,
    regions,
    cities,
    locations,
    employees,
  })) {
    assertStatus(result, 200, `Tenant Isolation ${label}`);
    assertTenantScope(result.body, tenantId, `Tenant Isolation ${label}`);
    assertNoForbiddenTenantNames(result.body, `Tenant Isolation ${label}`);
  }

  return {
    platformTenantsBlocked: true,
    scopedListsChecked: Object.keys({ areas, regions, cities, locations, employees }).length,
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

async function assertDeleted(
  baseUrl: string,
  token: string,
  path: string,
  label: string,
): Promise<void> {
  const result = await request<ApiJson>(baseUrl, 'GET', path, token);
  assertStatus(result, 404, `${label} nach Loeschung nicht mehr abrufbar`);
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

function assertTenantScope(rows: EntityBody[], tenantId: string, label: string): void {
  const wrongTenantRows = rows.filter(
    (row) => row.tenantId !== undefined && row.tenantId !== tenantId,
  );
  assert(
    wrongTenantRows.length === 0,
    `${label}: ${wrongTenantRows.length} Datensaetze aus fremdem Tenant sichtbar`,
  );
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

function extractPositiveNumbers(value: unknown): number[] {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractPositiveNumbers(entry));
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((entry) =>
      extractPositiveNumbers(entry),
    );
  }

  return [];
}

function localDateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(value.getDate()).padStart(2, '0')}`;
}

void verifyFrittenwerkTenantAdmin();
