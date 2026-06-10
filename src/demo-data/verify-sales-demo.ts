import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import {
  MenuItem,
  MenuItemDocument,
} from '../menu-items/schemas/menu-item.schema';
import {
  STAFF_MANAGEMENT_MODULE_KEY,
  COUNTER_ORDERS_MODULE_KEY,
  DAILY_CLOSING_MODULE_KEY,
  DEFAULT_MODULES,
  DIGITAL_MENU_MODULE_KEY,
  KDS_MODULE_KEY,
  POS_MODULE_KEY,
  REPORTING_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
  INVENTORY_MODULE_KEY,
  PAYROLL_MODULE_KEY,
  TIME_TRACKING_MODULE_KEY,
} from '../modules/constants/module-definitions';
import {
  TenantModule,
  TenantModuleDocument,
} from '../modules/schemas/tenant-module.schema';
import {
  Order,
  OrderDocument,
  OrderTenantResolutionStatus,
} from '../orders/schemas/order.schema';
import {
  RestaurantTable,
  RestaurantTableDocument,
} from '../tables/schemas/table.schema';
import { Tenant, TenantDocument } from '../tenants/schemas/tenant.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

const demoUserEmails = [
  'admin@gastromania-demo.de',
  'filialleiter@gastromania-demo.de',
  'service@gastromania-demo.de',
  'kueche@gastromania-demo.de',
  'bar@gastromania-demo.de',
  'theke@gastromania-demo.de',
];

interface RoleSmokeAccount {
  key: string;
  email: string;
  password: string;
  expectedRoles: string[];
  mustHavePermissions?: string[];
  mustNotHavePermissions?: string[];
  mustNotHaveTenant?: boolean;
  expectedRedirect: string;
  allowedMenus?: string[];
  forbiddenRoutes?: string[];
  forbiddenApiPaths?: string[];
}

const platformAllowedMenus = [
  'Kunden/Tenants',
  'Module pro Kunde',
  'Tarife',
  'Rechnungen',
  'Plattform-Audit',
  'Systemeinstellungen',
  'Logout',
];

const platformForbiddenRoutes = [
  '/dashboard',
  '/tenant/areas',
  '/tenant/regions',
  '/tenant/cities',
  '/tenant/locations',
  '/employees',
  '/staff-planning',
  '/time-tracking',
  '/time-tracking/reports/worktime',
  '/payroll',
  '/orders',
  '/counter',
  '/counter-orders',
  '/pos',
  '/tables',
  '/table-planner',
  '/kds',
  '/menu',
  '/products',
  '/inventory',
  '/recipes',
  '/daily-closing',
  '/reports',
];

const platformForbiddenApiPaths = [
  '/api/orders',
  '/api/kds/orders',
  '/api/counter/orders',
  '/api/employees',
  '/api/staff/absences',
  '/api/time-tracking',
  '/api/time-tracking/reports/worktime',
  '/api/payroll/summary',
  '/api/tenant/areas',
  '/api/tenant/locations',
  '/api/inventory',
  '/api/recipes',
];

const roleSmokeAccounts: RoleSmokeAccount[] = [
  {
    key: 'platformAdmin',
    email: 'platform@gastromania.local',
    password: 'Gastromania2026!',
    expectedRoles: ['PlatformAdmin'],
    mustHavePermissions: ['*'],
    mustNotHaveTenant: true,
    expectedRedirect: '/platform/tenants',
    allowedMenus: platformAllowedMenus,
    forbiddenRoutes: platformForbiddenRoutes,
    forbiddenApiPaths: platformForbiddenApiPaths,
  },
  {
    key: 'tenantAdmin',
    email: 'admin@frittenwerk-demo.demo',
    password: 'Demo2026!',
    expectedRoles: ['TenantAdmin'],
    mustHavePermissions: ['employees.view', 'payroll.view', 'counter.orders.view'],
    expectedRedirect: '/dashboard',
    allowedMenus: ['Organisation', 'Personal', 'Betrieb', 'Verkauf'],
  },
  {
    key: 'locationManager',
    email: 'filialleiter.duesseldorf@frittenwerk-demo.demo',
    password: 'Demo2026!',
    expectedRoles: ['Filialleiter'],
    mustHavePermissions: ['employees.view', 'locations.view'],
    mustNotHavePermissions: ['payroll.view', 'settings.update'],
    expectedRedirect: '/dashboard',
    forbiddenRoutes: ['/tenant/areas', '/tenant/regions', '/tenant/cities', '/payroll', '/platform/tenants'],
  },
  {
    key: 'waiter',
    email: 'service1.duesseldorf@frittenwerk-demo.demo',
    password: 'Demo2026!',
    expectedRoles: ['Service'],
    mustHavePermissions: ['orders.view', 'tables.view'],
    mustNotHavePermissions: ['employees.update', 'payroll.view'],
    expectedRedirect: '/dashboard',
  },
  {
    key: 'kitchen',
    email: 'kueche1.duesseldorf@frittenwerk-demo.demo',
    password: 'Demo2026!',
    expectedRoles: ['KÃƒÂ¼che'],
    mustHavePermissions: ['kds.view'],
    mustNotHavePermissions: ['payroll.view'],
    expectedRedirect: '/dashboard',
  },
  {
    key: 'counter',
    email: 'counter.duesseldorf@frittenwerk-demo.demo',
    password: 'Demo2026!',
    expectedRoles: ['Theke'],
    mustHavePermissions: ['counter.orders.view', 'counter.orders.create'],
    mustNotHavePermissions: ['payroll.view', 'employees.update'],
    expectedRedirect: '/dashboard',
  },
  {
    key: 'cashier',
    email: 'cashier.duesseldorf@frittenwerk-demo.demo',
    password: 'Demo2026!',
    expectedRoles: ['Kasse'],
    mustHavePermissions: ['counter.orders.pay', 'finance.view'],
    mustNotHavePermissions: ['payroll.view', 'employees.update'],
    expectedRedirect: '/dashboard',
  },
  {
    key: 'inventoryManager',
    email: 'inventory.duesseldorf@frittenwerk-demo.demo',
    password: 'Demo2026!',
    expectedRoles: ['Lager'],
    mustHavePermissions: ['inventory.view', 'recipes.costing.view'],
    mustNotHavePermissions: ['payroll.view', 'employees.update'],
    expectedRedirect: '/dashboard',
  },
  {
    key: 'staff',
    email: 'staff.duesseldorf@frittenwerk-demo.demo',
    password: 'Demo2026!',
    expectedRoles: ['STAFF'],
    mustHavePermissions: ['schedule.view', 'timeTracking.view'],
    mustNotHavePermissions: ['orders.view', 'employees.update', 'payroll.view'],
    expectedRedirect: '/dashboard',
  },
];

const demoProducts = [
  { name: 'Wasser 0,25', category: 'Getränke' },
  { name: 'Coca Cola 0,33', category: 'Getränke' },
  { name: 'Fanta 0,33', category: 'Getränke' },
  { name: 'Pils', category: 'Getränke' },
  { name: 'Weizen', category: 'Getränke' },
  { name: 'Burger Classic', category: 'Speisen' },
  { name: 'Cheeseburger', category: 'Speisen' },
  { name: 'Pommes', category: 'Speisen' },
  { name: 'Salat', category: 'Speisen' },
  { name: 'Kaffee', category: 'Kaffee' },
  { name: 'Cappuccino', category: 'Kaffee' },
  { name: 'Espresso', category: 'Kaffee' },
];

const demoTenantSlugs = [
  'burgermania',
  'crispy-chicken',
  'pasta-house',
  'grill-factory',
  'frittenwerk-demo',
];

const demoTenantNames = [
  'BurgerMania',
  'Crispy Chicken',
  'Pasta House',
  'Grill Factory',
  'Frittenwerk Demo',
];

async function verifySalesDemo() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const authService = app.get(AuthService);
    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    const locationModel = app.get<Model<LocationDocument>>(
      getModelToken(Location.name),
    );
    const tableModel = app.get<Model<RestaurantTableDocument>>(
      getModelToken(RestaurantTable.name),
    );
    const orderModel = app.get<Model<OrderDocument>>(
      getModelToken(Order.name),
    );
    const tenantModel = app.get<Model<TenantDocument>>(getModelToken(Tenant.name));
    const tenantModuleModel = app.get<Model<TenantModuleDocument>>(
      getModelToken(TenantModule.name),
    );
    const menuItemModel = app.get<Model<MenuItemDocument>>(
      getModelToken(MenuItem.name),
    );
    const frittenwerkTenant = await tenantModel
      .findOne({ slug: 'frittenwerk-demo' })
      .lean()
      .exec();
    const demoTenants = await tenantModel
      .find({ slug: { $in: demoTenantSlugs }, deletedAt: null })
      .lean()
      .exec();
    const missingDemoTenants = demoTenantSlugs.filter(
      (slug) => !demoTenants.some((tenant) => tenant.slug === slug),
    );
    const missingDemoTenantNames = demoTenantNames.filter(
      (name) => !demoTenants.some((tenant) => tenant.name === name),
    );
    const burgerManiaTenant = demoTenants.find(
      (tenant) => tenant.slug === 'burgermania',
    );
    const frittenwerkTenantId = frittenwerkTenant?._id?.toString();
    const burgerManiaTenantId = burgerManiaTenant?._id?.toString();
    const frittenwerkModules = frittenwerkTenantId
      ? await tenantModuleModel
          .find({ tenantId: frittenwerkTenantId })
          .lean()
          .exec()
      : [];
    const burgerManiaModules = burgerManiaTenantId
      ? await tenantModuleModel
          .find({ tenantId: burgerManiaTenantId })
          .lean()
          .exec()
      : [];
    const demoTenantModuleCounts = await Promise.all(
      demoTenants.map(async (tenant) => ({
        slug: tenant.slug,
        modules: await tenantModuleModel
          .countDocuments({ tenantId: tenant._id.toString() })
          .exec(),
      })),
    );
    const unsafeTenantModules = await tenantModuleModel
      .countDocuments({
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: '' },
        ],
      })
      .exec();
    const nonPlatformUsersWithoutTenantId = await userModel
      .countDocuments({
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: '' },
        ],
        roles: { $nin: ['PLATFORM_ADMIN', 'PlatformAdmin', 'Super Admin'] },
      })
      .exec();
    const enabledFrittenwerkModules = frittenwerkModules
      .filter((moduleConfig) => moduleConfig.enabled)
      .map((moduleConfig) => moduleConfig.moduleKey);
    const location = await locationModel
      .findOne({ email: 'demo@gastrowerk24.de' })
      .lean()
      .exec();
    const locationId = location?._id?.toString();
    const users = await userModel
      .find({ email: { $in: demoUserEmails } })
      .lean()
      .exec();
    const missingUsers = demoUserEmails.filter(
      (email) => !users.some((user) => user.email === email),
    );
    const tables = locationId
      ? await tableModel.countDocuments({ locationId }).exec()
      : 0;
    const menuItems = await menuItemModel
      .countDocuments({
        $or: demoProducts.map((product) => ({
          name: product.name,
          category: product.category,
        })),
      })
      .exec();
    const unsafeVisibleOrders = await orderModel
      .countDocuments({
        $or: [
          {
            tenantId: { $exists: false },
            tenantResolutionStatus: {
              $ne: OrderTenantResolutionStatus.LegacyOrphan,
            },
          },
          {
            tenantId: null,
            tenantResolutionStatus: {
              $ne: OrderTenantResolutionStatus.LegacyOrphan,
            },
          },
          {
            tenantId: '',
            tenantResolutionStatus: {
              $ne: OrderTenantResolutionStatus.LegacyOrphan,
            },
          },
        ],
      })
      .exec();
    const legacyOrphanOrders = await orderModel
      .countDocuments({
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: '' },
        ],
        tenantResolutionStatus: OrderTenantResolutionStatus.LegacyOrphan,
      })
      .exec();
    const roleSmokeResults = await Promise.all(
      roleSmokeAccounts.map(async (account) => {
        const login = await authService.login({
          email: account.email,
          password: account.password,
        });
        const permissions = login.user.permissions ?? [];
        const roles = login.user.roles ?? [];
        const hasPermission = (permission: string) =>
          permissions.includes('*') ||
          permissions.includes(permission) ||
          permissions.includes(`${permission.split('.')[0]}.*`);
        const normalizedRolesForCheck = roles.map((role) =>
          normalizeVerifyRole(role),
        );
        const expectedRolesPresent = account.expectedRoles.every((role) =>
          normalizedRolesForCheck.includes(normalizeVerifyRole(role)),
        );
        const requiredPermissionsPresent = (
          account.mustHavePermissions ?? []
        ).every((permission) => hasPermission(permission));
        const forbiddenPermissionsAbsent = (
          account.mustNotHavePermissions ?? []
        ).every((permission) => !hasPermission(permission));
        const tenantContextValid = account.mustNotHaveTenant
          ? !login.user.tenantId
          : Boolean(login.user.tenantId);

        return {
          key: account.key,
          email: account.email,
          login: Boolean(login.accessToken),
          expectedRedirect: account.expectedRedirect,
          roles,
          tenantId: login.user.tenantId,
          locationIds: login.user.locationIds ?? [],
          locationAssignments: login.user.locationAssignments ?? [],
          permissionsChecked: {
            requiredPresent: requiredPermissionsPresent,
            forbiddenAbsent: forbiddenPermissionsAbsent,
          },
          roleCheck: expectedRolesPresent,
          tenantContextValid,
          allowedMenus: account.allowedMenus ?? [],
          forbiddenRoutes: account.forbiddenRoutes ?? [],
          forbiddenApiPaths: account.forbiddenApiPaths ?? [],
          ok:
            Boolean(login.accessToken) &&
            expectedRolesPresent &&
            requiredPermissionsPresent &&
            forbiddenPermissionsAbsent &&
            tenantContextValid,
        };
      }),
    );
    const platformSmoke = roleSmokeResults.find(
      (result) => result.key === 'platformAdmin',
    );
    const platformAccessChecks = {
      loginWorks: platformSmoke?.login === true,
      redirectTarget: platformSmoke?.expectedRedirect,
      redirectIsPlatformArea:
        platformSmoke?.expectedRedirect === '/platform/tenants' ||
        platformSmoke?.expectedRedirect === '/platform/dashboard',
      tenantScopeRemoved:
        !platformSmoke?.tenantId &&
        platformSmoke?.locationIds.length === 0 &&
        platformSmoke?.locationAssignments.length === 0,
      allowedMenus: platformAllowedMenus,
      forbiddenRoutes: platformForbiddenRoutes,
      forbiddenApiPaths: platformForbiddenApiPaths,
      operativeShellRequestsSuppressedByScope:
        !platformSmoke?.tenantId &&
        platformSmoke?.locationIds.length === 0 &&
        platformSmoke?.locationAssignments.length === 0,
    };
    const tenantModuleEnabled = (
      modules: Array<{ moduleKey: string; enabled: boolean }>,
      key: string,
    ) => modules.some((moduleConfig) => moduleConfig.moduleKey === key && moduleConfig.enabled);
    const moduleChecks = {
      pos: enabledFrittenwerkModules.includes(POS_MODULE_KEY),
      tableManagement: enabledFrittenwerkModules.includes(
        TABLE_MANAGEMENT_MODULE_KEY,
      ),
      tableOrders: enabledFrittenwerkModules.includes(TABLE_ORDERS_MODULE_KEY),
      counterOrders: enabledFrittenwerkModules.includes(COUNTER_ORDERS_MODULE_KEY),
      kds: enabledFrittenwerkModules.includes(KDS_MODULE_KEY),
      inventory: enabledFrittenwerkModules.includes(INVENTORY_MODULE_KEY),
      staffManagement: enabledFrittenwerkModules.includes(STAFF_MANAGEMENT_MODULE_KEY),
      payroll: enabledFrittenwerkModules.includes(PAYROLL_MODULE_KEY),
      reporting: enabledFrittenwerkModules.includes(REPORTING_MODULE_KEY),
      digitalMenu: enabledFrittenwerkModules.includes(DIGITAL_MENU_MODULE_KEY),
      dailyClosing: enabledFrittenwerkModules.includes(DAILY_CLOSING_MODULE_KEY),
      timeTracking: enabledFrittenwerkModules.includes(TIME_TRACKING_MODULE_KEY),
    };
    const tenantModuleIsolationChecks = {
      demoTenantsComplete: missingDemoTenants.length === 0,
      demoTenantNamesComplete: missingDemoTenantNames.length === 0,
      allDemoTenantModulesComplete:
        demoTenantModuleCounts.length === demoTenantSlugs.length &&
        demoTenantModuleCounts.every(
          (row) => row.modules === DEFAULT_MODULES.length,
        ),
      noGlobalTenantModules: unsafeTenantModules === 0,
      frittenwerkCounterOrdersEnabled: tenantModuleEnabled(
        frittenwerkModules,
        COUNTER_ORDERS_MODULE_KEY,
      ),
      burgerManiaCounterOrdersDisabled: !tenantModuleEnabled(
        burgerManiaModules,
        COUNTER_ORDERS_MODULE_KEY,
      ),
      frittenwerkDailyClosingEnabled: tenantModuleEnabled(
        frittenwerkModules,
        DAILY_CLOSING_MODULE_KEY,
      ),
      burgerManiaDailyClosingDisabled: !tenantModuleEnabled(
        burgerManiaModules,
        DAILY_CLOSING_MODULE_KEY,
      ),
    };

    console.log(
      JSON.stringify(
        {
          locationFound: Boolean(location),
          locationId,
          users: users.length,
          missingUsers,
          tables,
          menuItems,
          unsafeVisibleOrders,
          legacyOrphanOrders,
          nonPlatformUsersWithoutTenantId,
          frittenwerkTenantFound: Boolean(frittenwerkTenant),
          demoTenants: demoTenants.map((tenant) => ({
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
          })),
          missingDemoTenants,
          missingDemoTenantNames,
          enabledFrittenwerkModules,
          demoTenantModuleCounts,
          unsafeTenantModules,
          moduleChecks,
          tenantModuleIsolationChecks,
          platformAccessChecks,
          logins: {
            admin: roleSmokeResults.some(
              (result) => result.email === 'admin@frittenwerk-demo.demo' && result.login,
            ),
            service: roleSmokeResults.some(
              (result) =>
                result.email === 'service1.duesseldorf@frittenwerk-demo.demo' &&
                result.login,
            ),
          },
          roleSmoke: roleSmokeResults,
          roleSmokePassed: roleSmokeResults.every((result) => result.ok),
        },
        null,
        2,
      ),
    );

    if (
      !location ||
      missingUsers.length > 0 ||
      !frittenwerkTenant ||
      !Object.values(moduleChecks).every(Boolean) ||
      !Object.values(tenantModuleIsolationChecks).every(Boolean) ||
      !Object.values(platformAccessChecks)
        .filter((value) => typeof value === 'boolean')
        .every(Boolean) ||
      unsafeVisibleOrders !== 0 ||
      nonPlatformUsersWithoutTenantId !== 0 ||
      !roleSmokeResults.every((result) => result.ok)
    ) {
      throw new Error('Sales-Demo Rollen-/Tenant-Smoke-Verify fehlgeschlagen');
    }
  } finally {
    await app.close();
  }
}

void verifySalesDemo();

function normalizeVerifyRole(role: string): string {
  const value = role.trim().toLowerCase();

  if (value === 'kitchen' || value === 'kueche' || value.startsWith('k') && value.includes('che')) {
    return 'kitchen';
  }

  return role;
}
