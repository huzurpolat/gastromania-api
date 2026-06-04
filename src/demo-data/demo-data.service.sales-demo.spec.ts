import bcrypt from 'bcrypt';
import { Role } from '../auth/enums/role.enum';
import { DemoDataService } from './demo-data.service';

type DemoDoc = Record<string, unknown> & { _id: string };

class FakeModel {
  readonly rows: DemoDoc[] = [];
  private sequence = 1;

  constructor(private readonly prefix: string) {}

  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set?: Record<string, unknown> },
  ) {
    const existing = this.rows.find((row) => this.matches(row, filter));
    const doc =
      existing ??
      ({
        _id: `${this.prefix}-${this.sequence++}`,
        ...filter,
      } as DemoDoc);

    Object.assign(doc, update.$set ?? update);

    if (!existing) {
      this.rows.push(doc);
    }

    return {
      exec: () => Promise.resolve(doc),
    };
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
    const reservationModel = new FakeModel('reservation');
    const userModel = new FakeModel('user');
    const dutyShiftModel = new FakeModel('duty-shift');
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
    const service = new DemoDataService(
      locationModel as never,
      tableModel as never,
      menuItemModel as never,
      orderModel as never,
      reservationModel as never,
      userModel as never,
      dutyShiftModel as never,
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
    );

    return {
      service,
      locationModel,
      tableModel,
      menuItemModel,
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
    };
  }

  it('creates the complete GastroWerk24 sales demo tenant once', async () => {
    const {
      service,
      locationModel,
      tableModel,
      menuItemModel,
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
    });
    expect(companyModel.rows).toHaveLength(1);
    expect(companyModel.rows[0]).toMatchObject({
      name: 'GastroWerk24 Demo Restaurant',
      type: 'sales-demo-restaurant',
      isActive: true,
    });
    expect(regionModel.rows).toHaveLength(1);
    expect(regionModel.rows[0]).toMatchObject({
      name: 'Nordrhein-Westfalen',
      code: 'NRW',
      isActive: true,
    });
    expect(locationModel.rows).toHaveLength(1);
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
    expect(tableModel.rows).toHaveLength(20);
    expect(
      tableModel.rows.filter((table) => table.status === 'Occupied'),
    ).toHaveLength(4);
    expect(
      tableModel.rows.filter((table) => table.area === 'Restaurantbereich'),
    ).toHaveLength(10);
    expect(
      tableModel.rows.filter((table) => table.area === 'Terrasse'),
    ).toHaveLength(5);
    expect(
      tableModel.rows.filter((table) => table.area === 'Lounge'),
    ).toHaveLength(5);
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
      ]),
    );
    expect(orderModel.rows).toHaveLength(4);
    expect(
      orderModel.rows.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
    ).toBeGreaterThan(0);
    expect(reservationModel.rows).toHaveLength(3);
    expect(stockItemModel.rows).toHaveLength(5);
    expect(
      stockItemModel.rows.reduce(
        (sum, item) =>
          sum + Number(item.quantity ?? 0) * Number(item.purchasePriceNet ?? 0),
        0,
      ),
    ).toBeGreaterThan(0);
    expect(stockMovementModel.rows).toHaveLength(5);
    expect(timeEntryModel.rows).toHaveLength(3);
    expect(checklistModel.rows).toHaveLength(2);
    expect(userModel.rows.map((user) => user.email)).toEqual(
      expect.arrayContaining([
        'admin@gastromania-demo.de',
        'filialleiter@gastromania-demo.de',
        'service@gastromania-demo.de',
        'kueche@gastromania-demo.de',
        'bar@gastromania-demo.de',
        'theke@gastromania-demo.de',
      ]),
    );
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
    } = createService();

    await service.seedSalesDemo();
    await service.seedSalesDemo();

    expect(companyModel.rows).toHaveLength(1);
    expect(regionModel.rows).toHaveLength(1);
    expect(locationModel.rows).toHaveLength(1);
    expect(departmentModel.rows).toHaveLength(5);
    expect(tableModel.rows).toHaveLength(20);
    expect(menuItemModel.rows).toHaveLength(12);
    expect(orderModel.rows).toHaveLength(4);
    expect(reservationModel.rows).toHaveLength(3);
    expect(stockItemModel.rows).toHaveLength(5);
    expect(stockMovementModel.rows).toHaveLength(5);
    expect(timeEntryModel.rows).toHaveLength(3);
    expect(checklistModel.rows).toHaveLength(2);
    expect(userModel.rows).toHaveLength(6);
  });
});
