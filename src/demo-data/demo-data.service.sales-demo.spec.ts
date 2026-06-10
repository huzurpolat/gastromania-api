import bcrypt from 'bcrypt';
import { Role } from '../auth/enums/role.enum';
import {
  COUNTER_ORDERS_MODULE_KEY,
  DAILY_CLOSING_MODULE_KEY,
  DEFAULT_MODULES,
  KDS_MODULE_KEY,
  POS_MODULE_KEY,
  REPORTING_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
} from '../modules/constants/module-definitions';
import {
  OrderSource,
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import { TableStatus } from '../tables/schemas/table.schema';
import { DemoDataService } from './demo-data.service';

type DemoDoc = Record<string, unknown> & { _id: string };

class FakeModel {
  readonly rows: DemoDoc[] = [];
  private sequence = 1;

  constructor(private readonly prefix: string) {}

  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: {
      $set?: Record<string, unknown>;
      $setOnInsert?: Record<string, unknown>;
    },
  ) {
    const existing = this.rows.find((row) => this.matches(row, filter));
    const doc =
      existing ??
      ({
        _id: `${this.prefix}-${this.sequence++}`,
        ...filter,
      } as DemoDoc);

    if (!existing) {
      Object.assign(doc, update.$setOnInsert ?? {});
    }
    Object.assign(doc, update.$set ?? update);

    if (!existing) {
      this.rows.push(doc);
    }

    return {
      exec: () => Promise.resolve(doc),
    };
  }

  find(filter: Record<string, unknown>) {
    const rows = this.rows.filter((row) => this.matches(row, filter));
    const query = {
      exec: () => Promise.resolve(rows),
      lean: () => Promise.resolve(rows),
      select: () => query,
    };

    return query;
  }

  updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
    const matched = this.rows.filter((row) => this.matches(row, filter));
    matched.forEach((row) => this.applyUpdate(row, update));

    return {
      exec: () => Promise.resolve({ modifiedCount: matched.length }),
    };
  }

  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
    const row = this.rows.find((entry) => this.matches(entry, filter));
    if (row) {
      this.applyUpdate(row, update);
    }

    return {
      exec: () => Promise.resolve({ modifiedCount: row ? 1 : 0 }),
    };
  }

  deleteMany(filter: Record<string, unknown>) {
    const remaining = this.rows.filter((row) => !this.matches(row, filter));
    const deletedCount = this.rows.length - remaining.length;
    this.rows.splice(0, this.rows.length, ...remaining);

    return {
      exec: () => Promise.resolve({ deletedCount }),
    };
  }

  insertMany(docs: Array<Record<string, unknown>>) {
    const inserted = docs.map((doc) => {
      const insertedDoc = {
        _id: `${this.prefix}-${this.sequence++}`,
        createdAt: doc.createdAt ?? new Date(),
        updatedAt: doc.updatedAt ?? new Date(),
        ...doc,
      } as DemoDoc;
      this.rows.push(insertedDoc);
      return insertedDoc;
    });

    return Promise.resolve(inserted);
  }

  private matches(row: DemoDoc, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => {
      if (key === '$or' && Array.isArray(value)) {
        return value.some((condition) =>
          this.matches(row, condition as Record<string, unknown>),
        );
      }

      if (value instanceof RegExp) {
        return value.test(this.stringValue(row[key]));
      }

      if (this.isPlainObject(value)) {
        const operators = value;
        if ('$in' in operators) {
          return (operators.$in as unknown[]).includes(row[key]);
        }

        if ('$nin' in operators) {
          return !(operators.$nin as unknown[]).includes(row[key]);
        }
      }

      if (value instanceof Date && row[key] instanceof Date) {
        return value.getTime() === row[key].getTime();
      }

      return row[key] === value;
    });
  }

  private applyUpdate(row: DemoDoc, update: Record<string, unknown>): void {
    const set = (update.$set as Record<string, unknown> | undefined) ?? {};
    Object.assign(row, set);

    const addToSet = update.$addToSet as Record<string, unknown> | undefined;
    if (addToSet) {
      for (const [key, value] of Object.entries(addToSet)) {
        const current = Array.isArray(row[key]) ? (row[key] as unknown[]) : [];
        if (!current.includes(value)) {
          row[key] = [...current, value];
        }
      }
    }

    const unset = update.$unset as Record<string, unknown> | undefined;
    if (unset) {
      for (const key of Object.keys(unset)) {
        delete row[key];
      }
    }
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  private stringValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value);
  }
}

describe('DemoDataService sales demo seed', () => {
  function createService() {
    const locationModel = new FakeModel('location');
    const tableModel = new FakeModel('table');
    const menuItemModel = new FakeModel('menu-item');
    const orderModel = new FakeModel('order');
    const recipeModel = new FakeModel('recipe');
    const reservationModel = new FakeModel('reservation');
    const userModel = new FakeModel('user');
    const userLocationAssignmentModel = new FakeModel('user-location-assignment');
    const dutyShiftModel = new FakeModel('duty-shift');
    const staffShiftModel = new FakeModel('staff-shift');
    const staffAbsenceModel = new FakeModel('staff-absence');
    const payrollPeriodModel = new FakeModel('payroll-period');
    const timeEntryModel = new FakeModel('time-entry');
    const weeklyMenuModel = new FakeModel('weekly-menu');
    const internalMessageModel = new FakeModel('internal-message');
    const stockItemModel = new FakeModel('stock-item');
    const stockMovementModel = new FakeModel('stock-movement');
    const inventoryBatchModel = new FakeModel('inventory-batch');
    const purchaseOrderModel = new FakeModel('purchase-order');
    const supplierModel = new FakeModel('supplier');
    const checklistModel = new FakeModel('checklist');
    const companyModel = new FakeModel('company');
    const departmentModel = new FakeModel('department');
    const regionModel = new FakeModel('region');
    const areaModel = new FakeModel('area');
    const tenantModel = new FakeModel('tenant');
    const tenantModuleModel = new FakeModel('tenant-module');
    const cityModel = new FakeModel('city');
    const service = new DemoDataService(
      locationModel as never,
      tableModel as never,
      menuItemModel as never,
      orderModel as never,
      recipeModel as never,
      reservationModel as never,
      userModel as never,
      userLocationAssignmentModel as never,
      dutyShiftModel as never,
      staffShiftModel as never,
      staffAbsenceModel as never,
      payrollPeriodModel as never,
      timeEntryModel as never,
      weeklyMenuModel as never,
      internalMessageModel as never,
      stockItemModel as never,
      stockMovementModel as never,
      inventoryBatchModel as never,
      purchaseOrderModel as never,
      supplierModel as never,
      checklistModel as never,
      companyModel as never,
      departmentModel as never,
      regionModel as never,
      areaModel as never,
      tenantModel as never,
      tenantModuleModel as never,
      cityModel as never,
    );

    return {
      service,
      locationModel,
      tableModel,
      menuItemModel,
      recipeModel,
      orderModel,
      reservationModel,
      userModel,
      userLocationAssignmentModel,
      stockItemModel,
      stockMovementModel,
      staffShiftModel,
      staffAbsenceModel,
      payrollPeriodModel,
      timeEntryModel,
      checklistModel,
      companyModel,
      departmentModel,
      regionModel,
      areaModel,
      tenantModel,
      tenantModuleModel,
      cityModel,
    };
  }

  it('creates the complete GastroWerk24 sales demo tenant once', async () => {
    const {
      service,
      locationModel,
      tableModel,
      menuItemModel,
      recipeModel,
      orderModel,
      reservationModel,
      userModel,
      userLocationAssignmentModel,
      stockItemModel,
      stockMovementModel,
      timeEntryModel,
      checklistModel,
      companyModel,
      departmentModel,
      regionModel,
      areaModel,
      tenantModel,
      tenantModuleModel,
      cityModel,
    } = createService();

    const result = await service.seedSalesDemo();

    expect(result.created).toMatchObject({
      companies: 1,
      regions: 1,
      locations: 1,
      departments: 5,
      users: 6,
      tables: 20,
      menuItems: 12,
      orders: 4,
      reservations: 3,
      stockItems: 5,
      stockMovements: 5,
      timeEntries: 3,
      checklists: 2,
      demoTenants: 5,
      demoTenantAreas: 10,
      demoTenantRegions: 20,
      demoTenantLocations: 10,
      demoTenantUsers: 80,
      demoTenantModules: DEFAULT_MODULES.length * 5,
      frittenwerkDemoTables: 5,
      frittenwerkDemoMenuItems: 11,
      frittenwerkDemoOrders: 9,
    });
    expect(companyModel.rows).toHaveLength(8);
    expect(companyModel.rows[0]).toMatchObject({
      name: 'GastroWerk24 Demo Restaurant',
      type: 'sales-demo-restaurant',
      isActive: true,
    });
    expect(regionModel.rows).toHaveLength(21);
    expect(regionModel.rows[0]).toMatchObject({
      name: 'Nordrhein-Westfalen',
      code: 'NRW',
      isActive: true,
    });
    expect(locationModel.rows).toHaveLength(11);
    expect(locationModel.rows[0]).toMatchObject({
      name: 'GastroWerk24 Demo Restaurant Köln',
      street: 'Musterstraße 1',
      zip: '50667',
      city: 'Köln',
      phone: '0221 123456',
      email: 'demo@gastrowerk24.de',
      federalState: 'Nordrhein-Westfalen',
    });
    expect(locationModel.rows[0].tablePlanAreas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Restaurantbereich' }),
        expect.objectContaining({ label: 'Terrasse' }),
        expect.objectContaining({ label: 'Lounge' }),
        expect.objectContaining({ label: 'Theke' }),
      ]),
    );
    expect(departmentModel.rows).toHaveLength(5);
    expect(tableModel.rows).toHaveLength(25);
    expect(
      tableModel.rows.filter(
        (table) =>
          table.locationId === locationModel.rows[0]._id &&
          table.status === 'Occupied',
      ),
    ).toHaveLength(4);
    expect(
      tableModel.rows.filter(
        (table) =>
          table.locationId === locationModel.rows[0]._id &&
          table.area === 'Restaurantbereich',
      ),
    ).toHaveLength(10);
    expect(
      tableModel.rows.filter(
        (table) =>
          table.locationId === locationModel.rows[0]._id &&
          table.area === 'Terrasse',
      ),
    ).toHaveLength(5);
    expect(
      tableModel.rows.filter(
        (table) =>
          table.locationId === locationModel.rows[0]._id &&
          table.area === 'Lounge',
      ),
    ).toHaveLength(5);
    expect(menuItemModel.rows.length).toBeGreaterThanOrEqual(22);
    expect(menuItemModel.rows.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'Wasser 0,25',
        'Coca Cola 0,33',
        'Fanta 0,33',
        'Pils',
        'Weizen',
        'Burger Classic',
        'Cheeseburger',
        'Pommes',
        'Salat',
        'Kaffee',
        'Cappuccino',
        'Espresso',
        'Classic Burger',
        'Cheese Burger',
        'Veggie Burger',
        'Pommes Klein',
        'Pommes Gross',
        'Currywurst',
        'Chicken Nuggets',
        'Cola',
        'Wasser',
        'Apfelschorle',
      ]),
    );
    expect(orderModel.rows).toHaveLength(13);
    expect(
      orderModel.rows.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
    ).toBeGreaterThan(0);
    const frittenwerkTenant = tenantModel.rows.find(
      (tenant) => tenant.slug === 'frittenwerk-demo',
    );
    const frittenwerkLocation = locationModel.rows.find(
      (location) => location.tenantId === frittenwerkTenant?._id,
    );
    const frittenwerkOrders = orderModel.rows.filter(
      (order) => order.tenantId === frittenwerkTenant?._id,
    );
    expect(frittenwerkOrders).toHaveLength(9);
    expect(frittenwerkOrders.every((order) => order.locationId === frittenwerkLocation?._id)).toBe(
      true,
    );
    expect(
      frittenwerkOrders.filter((order) =>
        [OrderStatus.New, OrderStatus.Accepted].includes(
          order.status as OrderStatus,
        ),
      ),
    ).toHaveLength(3);
    expect(
      frittenwerkOrders.filter(
        (order) => order.status === OrderStatus.Preparing,
      ),
    ).toHaveLength(2);
    expect(
      frittenwerkOrders.filter((order) => order.status === OrderStatus.Ready),
    ).toHaveLength(2);
    expect(
      frittenwerkOrders.filter((order) => order.status === OrderStatus.Closed),
    ).toHaveLength(1);
    expect(
      frittenwerkOrders.filter(
        (order) => order.status === OrderStatus.Cancelled,
      ),
    ).toHaveLength(1);
    expect(
      frittenwerkOrders.filter((order) => order.source === OrderSource.Counter)
        .map((order) => order.pickupNumber),
    ).toEqual(expect.arrayContaining(['101', '102', '103']));
    expect(
      frittenwerkOrders.some(
        (order) =>
          order.paymentStatus === PaymentStatus.Paid &&
          Number(order.total ?? 0) > 0,
      ),
    ).toBe(true);
    expect(
      tableModel.rows.filter(
        (table) =>
          table.locationId === frittenwerkLocation?._id &&
          table.name === 'Tisch 1' &&
          table.status === TableStatus.Ordering,
      ),
    ).toHaveLength(1);
    expect(
      tableModel.rows.filter(
        (table) =>
          table.locationId === frittenwerkLocation?._id &&
          table.name === 'Tisch 2' &&
          table.status === TableStatus.InPreparation,
      ),
    ).toHaveLength(1);
    expect(
      tableModel.rows.filter(
        (table) =>
          table.locationId === frittenwerkLocation?._id &&
          table.name === 'Tisch 3' &&
          table.status === TableStatus.ReadyToServe,
      ),
    ).toHaveLength(1);
    expect(
      tableModel.rows.filter(
        (table) =>
          table.locationId === frittenwerkLocation?._id &&
          table.name === 'Tisch 4' &&
          table.status === TableStatus.Paid,
      ),
    ).toHaveLength(1);
    expect(cityModel.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tenantId: frittenwerkTenant?._id,
          name: frittenwerkLocation?.city,
        }),
      ]),
    );
    expect(reservationModel.rows).toHaveLength(3);
    expect(stockItemModel.rows).toHaveLength(16);
    expect(
      stockItemModel.rows.reduce(
        (sum, item) =>
          sum + Number(item.quantity ?? 0) * Number(item.purchasePriceNet ?? 0),
        0,
      ),
    ).toBeGreaterThan(0);
    expect(recipeModel.rows).toHaveLength(11);
    expect(
      recipeModel.rows.filter((recipe) => recipe.locationId === frittenwerkLocation?._id),
    ).toHaveLength(11);
    expect(stockMovementModel.rows).toHaveLength(23);
    expect(
      stockMovementModel.rows.filter((movement) =>
        String(movement.note ?? '').startsWith('Frittenwerk-Demo-COGS-'),
      ),
    ).toHaveLength(18);
    expect(
      timeEntryModel.rows.filter((entry) =>
        String(entry.note ?? '').startsWith('Sales-Demo-'),
      ),
    ).toHaveLength(3);
    expect(
      timeEntryModel.rows.filter((entry) =>
        String(entry.note ?? '').startsWith('Payroll-Demo-'),
      ).length,
    ).toBeGreaterThan(0);
    expect(checklistModel.rows).toHaveLength(2);
    expect(areaModel.rows).toHaveLength(10);
    expect(tenantModel.rows).toHaveLength(7);
    expect(tenantModel.rows.map((tenant) => tenant.slug)).toEqual(
      expect.arrayContaining([
        'burgermania',
        'crispy-chicken',
        'pasta-house',
        'grill-factory',
        'frittenwerk-demo',
        'demo-test-tenant',
      ]),
    );
    expect(tenantModuleModel.rows).toHaveLength(DEFAULT_MODULES.length * 8);
    expect(
      tenantModuleModel.rows.filter(
        (moduleRow) =>
          moduleRow.tenantId === frittenwerkTenant?._id &&
          [
            POS_MODULE_KEY,
            TABLE_ORDERS_MODULE_KEY,
            TABLE_MANAGEMENT_MODULE_KEY,
            COUNTER_ORDERS_MODULE_KEY,
            KDS_MODULE_KEY,
            REPORTING_MODULE_KEY,
            DAILY_CLOSING_MODULE_KEY,
          ].includes(String(moduleRow.moduleKey)) &&
          moduleRow.enabled === true,
      ),
    ).toHaveLength(7);
    expect(userModel.rows.map((user) => user.email)).toEqual(
      expect.arrayContaining([
        'admin@gastromania-demo.de',
        'filialleiter@gastromania-demo.de',
        'service@gastromania-demo.de',
        'kueche@gastromania-demo.de',
        'bar@gastromania-demo.de',
        'theke@gastromania-demo.de',
        'admin@burgermania.demo',
        'admin@crispy-chicken.demo',
        'admin@pasta-house.demo',
        'admin@grill-factory.demo',
        'admin@frittenwerk-demo.demo',
        'admin@demo-test-tenant.demo',
        'regionalleiter@burgermania.demo',
        'filialleiter.koeln@burgermania.demo',
        'service1.koeln@burgermania.demo',
        'service2.koeln@burgermania.demo',
        'kueche1.koeln@burgermania.demo',
        'kueche2.koeln@burgermania.demo',
      ]),
    );
    expect(userModel.rows).toHaveLength(87);
    expect(userLocationAssignmentModel.rows.length).toBeGreaterThan(0);
    expect(userLocationAssignmentModel.rows.map((assignment) => assignment.role)).toEqual(
      expect.arrayContaining([
        Role.LocationManager,
        Role.Waiter,
        Role.Kitchen,
        Role.Counter,
        Role.Cashier,
        Role.InventoryManager,
        Role.Staff,
      ]),
    );
    const tenantAdmin = userModel.rows.find(
      (user) => user.email === 'admin@burgermania.demo',
    );
    expect(tenantAdmin).toMatchObject({
      roles: [Role.TenantAdminCode],
      status: 'active',
      isActive: true,
    });
    expect(tenantAdmin?.tenantId).toBeTruthy();
    expect((tenantAdmin?.locationIds as unknown[]).length).toBe(3);
    expect(result.demoUsers).toEqual(
      expect.arrayContaining([
        {
          email: 'admin@gastromania-demo.de',
          password: 'Demo2026!',
          role: Role.Admin,
        },
        {
          email: 'filialleiter@gastromania-demo.de',
          password: 'Demo2026!',
          role: Role.Filialleiter,
        },
        {
          email: 'service@gastromania-demo.de',
          password: 'Demo2026!',
          role: Role.Service,
        },
        {
          email: 'kueche@gastromania-demo.de',
          password: 'Demo2026!',
          role: Role.Kueche,
        },
        {
          email: 'bar@gastromania-demo.de',
          password: 'Demo2026!',
          role: Role.Bar,
        },
        {
          email: 'theke@gastromania-demo.de',
          password: 'Demo2026!',
          role: Role.Theke,
        },
      ]),
    );
    const admin = userModel.rows.find(
      (user) => user.email === 'admin@gastromania-demo.de',
    );

    expect(admin).toBeDefined();
    expect(await bcrypt.compare('Demo2026!', String(admin?.passwordHash))).toBe(
      true,
    );
  });

  it('updates the sales demo without creating duplicates', async () => {
    const {
      service,
      locationModel,
      tableModel,
      menuItemModel,
      recipeModel,
      orderModel,
      reservationModel,
      userModel,
      stockItemModel,
      stockMovementModel,
      timeEntryModel,
      checklistModel,
      companyModel,
      departmentModel,
      regionModel,
      areaModel,
      tenantModel,
      tenantModuleModel,
    } = createService();

    await service.seedSalesDemo();
    await service.seedSalesDemo();

    expect(companyModel.rows).toHaveLength(8);
    expect(regionModel.rows).toHaveLength(21);
    expect(locationModel.rows).toHaveLength(11);
    expect(departmentModel.rows).toHaveLength(5);
    expect(tableModel.rows).toHaveLength(25);
    expect(menuItemModel.rows.length).toBeGreaterThanOrEqual(22);
    expect(orderModel.rows).toHaveLength(13);
    expect(reservationModel.rows).toHaveLength(3);
    expect(stockItemModel.rows).toHaveLength(16);
    expect(recipeModel.rows).toHaveLength(11);
    expect(stockMovementModel.rows).toHaveLength(23);
    expect(
      timeEntryModel.rows.filter((entry) =>
        String(entry.note ?? '').startsWith('Sales-Demo-'),
      ),
    ).toHaveLength(3);
    expect(
      timeEntryModel.rows.filter((entry) =>
        String(entry.note ?? '').startsWith('Payroll-Demo-'),
      ).length,
    ).toBeGreaterThan(0);
    expect(checklistModel.rows).toHaveLength(2);
    expect(userModel.rows).toHaveLength(87);
    expect(areaModel.rows).toHaveLength(10);
    expect(tenantModel.rows).toHaveLength(7);
    expect(tenantModuleModel.rows).toHaveLength(DEFAULT_MODULES.length * 8);
  });

  it('bootstraps the platform admin and five development demo tenants without the manual sales seed', async () => {
    const { service, companyModel, locationModel, regionModel, userModel, areaModel, tenantModel, tenantModuleModel } =
      createService();

    await service.onApplicationBootstrap();
    await service.onApplicationBootstrap();

    expect(companyModel.rows).toHaveLength(7);
    expect(tenantModel.rows).toHaveLength(7);
    expect(tenantModel.rows.map((tenant) => tenant.slug)).toEqual(
      expect.arrayContaining([
        'burgermania',
        'crispy-chicken',
        'pasta-house',
        'grill-factory',
        'frittenwerk-demo',
        'demo-test-tenant',
      ]),
    );
    expect(areaModel.rows).toHaveLength(10);
    expect(regionModel.rows).toHaveLength(20);
    expect(locationModel.rows).toHaveLength(10);
    expect(userModel.rows).toHaveLength(82);
    expect(tenantModuleModel.rows).toHaveLength(DEFAULT_MODULES.length * 7);
    expect(userModel.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'platform@gastromania.local',
          roles: [Role.PlatformAdminCode],
          permissions: ['*'],
          status: 'active',
          tenantId: undefined,
          companyId: undefined,
        }),
        expect.objectContaining({
          email: 'admin@burgermania.demo',
          roles: [Role.TenantAdminCode],
          status: 'active',
        }),
        expect.objectContaining({
          email: 'admin@crispy-chicken.demo',
          roles: [Role.TenantAdminCode],
          status: 'active',
        }),
        expect.objectContaining({
          email: 'admin@pasta-house.demo',
          roles: [Role.TenantAdminCode],
          status: 'active',
        }),
        expect.objectContaining({
          email: 'admin@grill-factory.demo',
          roles: [Role.TenantAdminCode],
          status: 'active',
        }),
        expect.objectContaining({
          email: 'admin@frittenwerk-demo.demo',
          roles: [Role.TenantAdminCode],
          status: 'active',
        }),
        expect.objectContaining({
          email: 'admin@demo-test-tenant.demo',
          roles: [Role.TenantAdmin],
          status: 'active',
        }),
      ]),
    );
  });

  it('does not create development demo tenants in production', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const {
      service,
      companyModel,
      locationModel,
      regionModel,
      userModel,
      areaModel,
      tenantModel,
      tenantModuleModel,
    } = createService();

    try {
      const result = await service.seedSalesDemo();

      expect(result.created).toMatchObject({
        demoTenants: 0,
        demoTenantAreas: 0,
        demoTenantRegions: 0,
        demoTenantLocations: 0,
        demoTenantUsers: 0,
        demoTenantModules: 0,
        frittenwerkDemoTables: 0,
        frittenwerkDemoMenuItems: 0,
        frittenwerkDemoOrders: 0,
      });
      expect(companyModel.rows).toHaveLength(1);
      expect(regionModel.rows).toHaveLength(1);
      expect(locationModel.rows).toHaveLength(1);
      expect(userModel.rows).toHaveLength(6);
      expect(areaModel.rows).toHaveLength(0);
      expect(tenantModel.rows).toHaveLength(0);
      expect(tenantModuleModel.rows).toHaveLength(DEFAULT_MODULES.length);
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });
});
