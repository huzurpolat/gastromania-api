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
      exec: async () => doc,
    };
  }

  private matches(row: DemoDoc, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => row[key] === value);
  }
}

describe('DemoDataService sales demo seed', () => {
  function createService() {
    const locationModel = new FakeModel('location');
    const tableModel = new FakeModel('table');
    const menuItemModel = new FakeModel('menu-item');
    const userModel = new FakeModel('user');
    const companyModel = new FakeModel('company');
    const departmentModel = new FakeModel('department');
    const regionModel = new FakeModel('region');
    const unusedModel = new FakeModel('unused');
    const service = new DemoDataService(
      locationModel as never,
      tableModel as never,
      menuItemModel as never,
      unusedModel as never,
      unusedModel as never,
      userModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      unusedModel as never,
      companyModel as never,
      departmentModel as never,
      regionModel as never,
    );

    return {
      service,
      locationModel,
      tableModel,
      menuItemModel,
      userModel,
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
      userModel,
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
      tableModel.rows.filter((table) => table.area === 'Restaurantbereich'),
    ).toHaveLength(10);
    expect(tableModel.rows.filter((table) => table.area === 'Terrasse')).toHaveLength(
      5,
    );
    expect(tableModel.rows.filter((table) => table.area === 'Lounge')).toHaveLength(
      5,
    );
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
      userModel,
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
    expect(userModel.rows).toHaveLength(6);
  });
});
