import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Checklist,
  ChecklistDocument,
  ChecklistStatus,
} from '../checklists/schemas/checklist.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  Department,
  DepartmentDocument,
  DepartmentType,
} from '../departments/schemas/department.schema';
import { Area, AreaDocument } from '../areas/schemas/area.schema';
import {
  DutyShift,
  DutyShiftDocument,
} from '../duty-schedules/schemas/duty-shift.schema';
import {
  InternalMessage,
  InternalMessageDocument,
  InternalMessagePriority,
} from '../internal-messages/schemas/internal-message.schema';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import {
  MenuItem,
  MenuItemDocument,
} from '../menu-items/schemas/menu-item.schema';
import {
  Order,
  OrderDocument,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  ProductionArea,
} from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationDocument,
  ReservationStatus,
} from '../reservations/schemas/reservation.schema';
import { Region, RegionDocument } from '../regions/schemas/region.schema';
import {
  BillingStatus,
  LicenseStatus,
  Tenant,
  TenantDocument,
  TenantStatus,
} from '../tenants/schemas/tenant.schema';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableShape,
  TableStatus,
} from '../tables/schemas/table.schema';
import { DEFAULT_MODULES } from '../modules/constants/module-definitions';
import {
  TenantModule,
  TenantModuleDocument,
} from '../modules/schemas/tenant-module.schema';
import {
  StockItem,
  StockItemDocument,
} from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementDocument,
  StockMovementType,
} from '../stock/schemas/stock-movement.schema';
import {
  InventoryBatch,
  InventoryBatchDocument,
} from '../stock/schemas/inventory-batch.schema';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderStatus,
} from '../stock/schemas/purchase-order.schema';
import {
  Supplier,
  SupplierDocument,
} from '../suppliers/schemas/supplier.schema';
import {
  TimeEntry,
  TimeEntryDocument,
} from '../time-tracking/schemas/time-entry.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  WeeklyMenu,
  WeeklyMenuDocument,
} from '../weekly-menus/schemas/weekly-menu.schema';

export interface DemoDataResult {
  locationId: string;
  created: Record<string, number>;
  demoUsers: Array<{
    email: string;
    password: string;
    role: string;
  }>;
}

interface DemoLocationConfig {
  key: string;
  name: string;
  city: string;
  zip: string;
  street: string;
  emailSlug: string;
  icon: string;
}

interface DemoRegionConfig {
  key: string;
  name: string;
  code: string;
  federalState: string;
  locations: DemoLocationConfig[];
  mainLocationKey: string;
  multiManagerLocationKeys: string[];
}

interface SalesDemoUserConfig {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  departmentType?: DepartmentType;
}

interface SalesDemoMenuItemConfig {
  name: string;
  category: string;
  description: string;
  ingredients: string;
  weight: string;
  price: number;
  isKitchenItem: boolean;
  isVegan?: boolean;
}

interface DevelopmentTenantConfig {
  name: string;
  slug: string;
  locations: Array<{
    city: string;
    area: 'NRW' | 'Bayern';
    region: 'Rheinland' | 'Ruhrgebiet' | 'Oberbayern' | 'Franken';
    zip: string;
    street: string;
  }>;
}

@Injectable()
export class DemoDataService implements OnApplicationBootstrap {
  private readonly demoPrefix = '[Demo]';
  private readonly demoPassword = 'Gastromania2026!';
  private readonly demoCompanyName = 'Gastro Group Deutschland';
  private readonly salesDemoPassword = 'Demo2026!';
  private readonly salesDemoCompanyName = 'GastroWerk24 Demo Restaurant';
  private readonly salesDemoLocationName = 'GastroWerk24 Demo Restaurant Köln';
  private readonly salesDemoRegionCode = 'NRW';
  private readonly developmentPlatformAdminEmail = 'platform@gastromania.local';
  private readonly developmentPlatformAdminPassword = 'Gastromania2026!';
  private readonly tenantDemoPassword = 'Demo2026!';
  private readonly tenantDemoActiveModuleKeys = new Set([
    'pos',
    'table_management',
    'kds',
    'digital_menu',
    'reporting',
    'inventory',
    'recipes',
    'staff_management',
    'module_management',
  ]);
  private readonly developmentTenantConfigs: DevelopmentTenantConfig[] = [
    {
      name: 'BurgerMania',
      slug: 'burgermania',
      locations: [
        { city: 'Köln', area: 'NRW', region: 'Rheinland', zip: '50667', street: 'Hohe Straße 1' },
        { city: 'Bonn', area: 'NRW', region: 'Rheinland', zip: '53111', street: 'Markt 12' },
        { city: 'Düsseldorf', area: 'NRW', region: 'Rheinland', zip: '40213', street: 'Königsallee 20' },
      ],
    },
    {
      name: 'Crispy Chicken',
      slug: 'crispy-chicken',
      locations: [
        { city: 'Köln', area: 'NRW', region: 'Rheinland', zip: '50667', street: 'Schildergasse 45' },
        { city: 'Essen', area: 'NRW', region: 'Ruhrgebiet', zip: '45127', street: 'Limbecker Platz 1' },
      ],
    },
    {
      name: 'Pasta House',
      slug: 'pasta-house',
      locations: [
        { city: 'Düsseldorf', area: 'NRW', region: 'Rheinland', zip: '40213', street: 'Altstadt 8' },
        { city: 'Dortmund', area: 'NRW', region: 'Ruhrgebiet', zip: '44137', street: 'Westenhellweg 30' },
      ],
    },
    {
      name: 'Grill Factory',
      slug: 'grill-factory',
      locations: [
        { city: 'Köln', area: 'NRW', region: 'Rheinland', zip: '50667', street: 'Domkloster 4' },
        { city: 'München', area: 'Bayern', region: 'Oberbayern', zip: '80331', street: 'Marienplatz 7' },
      ],
    },
    {
      name: 'Frittenwerk Demo',
      slug: 'frittenwerk-demo',
      locations: [
        { city: 'Düsseldorf', area: 'NRW', region: 'Rheinland', zip: '40213', street: 'Bolkerstraße 14' },
      ],
    },
  ];
  private readonly salesDemoUsers: SalesDemoUserConfig[] = [
    {
      email: 'admin@gastromania-demo.de',
      firstName: 'Admin',
      lastName: 'Demo',
      role: Role.Admin,
    },
    {
      email: 'filialleiter@gastromania-demo.de',
      firstName: 'Filialleiter',
      lastName: 'Demo',
      role: Role.Filialleiter,
    },
    {
      email: 'service@gastromania-demo.de',
      firstName: 'Service',
      lastName: 'Demo',
      role: Role.Service,
      departmentType: DepartmentType.Service,
    },
    {
      email: 'kueche@gastromania-demo.de',
      firstName: 'Küche',
      lastName: 'Demo',
      role: Role.Kueche,
      departmentType: DepartmentType.Kueche,
    },
    {
      email: 'bar@gastromania-demo.de',
      firstName: 'Bar',
      lastName: 'Demo',
      role: Role.Bar,
      departmentType: DepartmentType.Service,
    },
    {
      email: 'theke@gastromania-demo.de',
      firstName: 'Theke',
      lastName: 'Demo',
      role: Role.Theke,
      departmentType: DepartmentType.Service,
    },
  ];
  private readonly salesDemoMenuItems: SalesDemoMenuItemConfig[] = [
    {
      name: 'Wasser 0,25',
      category: 'Getränke',
      description: 'Mineralwasser in der 0,25-l-Flasche',
      ingredients: 'Mineralwasser',
      weight: '0,25 l',
      price: 2.5,
      isKitchenItem: false,
    },
    {
      name: 'Coca Cola 0,33',
      category: 'Getränke',
      description: 'Coca Cola in der 0,33-l-Flasche',
      ingredients: 'Cola',
      weight: '0,33 l',
      price: 3.2,
      isKitchenItem: false,
    },
    {
      name: 'Fanta 0,33',
      category: 'Getränke',
      description: 'Fanta Orange in der 0,33-l-Flasche',
      ingredients: 'Orangenlimonade',
      weight: '0,33 l',
      price: 3.2,
      isKitchenItem: false,
    },
    {
      name: 'Pils',
      category: 'Getränke',
      description: 'Frisch gezapftes Pils',
      ingredients: 'Pils',
      weight: '0,3 l',
      price: 4.2,
      isKitchenItem: false,
    },
    {
      name: 'Weizen',
      category: 'Getränke',
      description: 'Weizenbier im Glas',
      ingredients: 'Weizenbier',
      weight: '0,5 l',
      price: 4.9,
      isKitchenItem: false,
    },
    {
      name: 'Burger Classic',
      category: 'Speisen',
      description: 'Klassischer Burger mit Rindfleisch, Salat und Haussauce',
      ingredients: 'Brioche, Rindfleisch, Salat, Tomate, Haussauce',
      weight: '420 g',
      price: 12.9,
      isKitchenItem: true,
    },
    {
      name: 'Cheeseburger',
      category: 'Speisen',
      description: 'Burger Classic mit Cheddar',
      ingredients: 'Brioche, Rindfleisch, Cheddar, Salat, Tomate, Haussauce',
      weight: '450 g',
      price: 13.9,
      isKitchenItem: true,
    },
    {
      name: 'Pommes',
      category: 'Speisen',
      description: 'Knusprige Pommes frites mit Dip',
      ingredients: 'Kartoffeln, Salz, Dip',
      weight: '250 g',
      price: 4.9,
      isKitchenItem: true,
      isVegan: true,
    },
    {
      name: 'Salat',
      category: 'Speisen',
      description: 'Gemischter Salat mit saisonalem Gemüse',
      ingredients: 'Blattsalat, Gurke, Tomate, Paprika, Dressing',
      weight: '320 g',
      price: 9.9,
      isKitchenItem: true,
      isVegan: true,
    },
    {
      name: 'Kaffee',
      category: 'Kaffee',
      description: 'Frisch gebrühter Kaffee',
      ingredients: 'Kaffee',
      weight: '1 Tasse',
      price: 2.8,
      isKitchenItem: false,
    },
    {
      name: 'Cappuccino',
      category: 'Kaffee',
      description: 'Espresso mit cremigem Milchschaum',
      ingredients: 'Espresso, Milch',
      weight: '1 Tasse',
      price: 3.6,
      isKitchenItem: false,
    },
    {
      name: 'Espresso',
      category: 'Kaffee',
      description: 'Kräftiger Espresso',
      ingredients: 'Espresso',
      weight: '1 Tasse',
      price: 2.4,
      isKitchenItem: false,
    },
  ];
  private readonly demoRegions: DemoRegionConfig[] = [
    {
      key: 'nrw',
      name: 'NRW',
      code: 'NRW',
      federalState: 'Nordrhein-Westfalen',
      mainLocationKey: 'bonn',
      multiManagerLocationKeys: ['bonn', 'essen'],
      locations: [
        {
          key: 'bonn',
          name: 'Bonn',
          city: 'Bonn',
          zip: '53111',
          street: 'Markt 1',
          emailSlug: 'bonn',
          icon: 'restaurant',
        },
        {
          key: 'koeln',
          name: 'Köln',
          city: 'Köln',
          zip: '50667',
          street: 'Domplatz 4',
          emailSlug: 'koeln',
          icon: 'storefront',
        },
        {
          key: 'essen',
          name: 'Essen',
          city: 'Essen',
          zip: '45127',
          street: 'Limbecker Platz 7',
          emailSlug: 'essen',
          icon: 'local_cafe',
        },
        {
          key: 'olpe',
          name: 'Olpe',
          city: 'Olpe',
          zip: '57462',
          street: 'Biggeseestrasse 12',
          emailSlug: 'olpe',
          icon: 'deck',
        },
      ],
    },
    {
      key: 'hessen',
      name: 'Hessen',
      code: 'HESSEN',
      federalState: 'Hessen',
      mainLocationKey: 'frankfurt',
      multiManagerLocationKeys: ['frankfurt', 'wiesbaden'],
      locations: [
        {
          key: 'frankfurt',
          name: 'Frankfurt',
          city: 'Frankfurt am Main',
          zip: '60311',
          street: 'Roemerberg 2',
          emailSlug: 'frankfurt',
          icon: 'restaurant',
        },
        {
          key: 'wiesbaden',
          name: 'Wiesbaden',
          city: 'Wiesbaden',
          zip: '65183',
          street: 'Schlossplatz 1',
          emailSlug: 'wiesbaden',
          icon: 'storefront',
        },
        {
          key: 'kassel',
          name: 'Kassel',
          city: 'Kassel',
          zip: '34117',
          street: 'Koenigsplatz 5',
          emailSlug: 'kassel',
          icon: 'local_cafe',
        },
        {
          key: 'darmstadt',
          name: 'Darmstadt',
          city: 'Darmstadt',
          zip: '64283',
          street: 'Luisenplatz 8',
          emailSlug: 'darmstadt',
          icon: 'local_bar',
        },
      ],
    },
    {
      key: 'bayern',
      name: 'Bayern',
      code: 'BAYERN',
      federalState: 'Bayern',
      mainLocationKey: 'muenchen',
      multiManagerLocationKeys: ['muenchen', 'augsburg'],
      locations: [
        {
          key: 'muenchen',
          name: 'München',
          city: 'München',
          zip: '80331',
          street: 'Marienplatz 3',
          emailSlug: 'muenchen',
          icon: 'restaurant',
        },
        {
          key: 'nuernberg',
          name: 'Nürnberg',
          city: 'Nürnberg',
          zip: '90403',
          street: 'Hauptmarkt 6',
          emailSlug: 'nuernberg',
          icon: 'storefront',
        },
        {
          key: 'augsburg',
          name: 'Augsburg',
          city: 'Augsburg',
          zip: '86150',
          street: 'Rathausplatz 2',
          emailSlug: 'augsburg',
          icon: 'local_cafe',
        },
        {
          key: 'regensburg',
          name: 'Regensburg',
          city: 'Regensburg',
          zip: '93047',
          street: 'Domplatz 9',
          emailSlug: 'regensburg',
          icon: 'deck',
        },
      ],
    },
    {
      key: 'berlin',
      name: 'Berlin',
      code: 'BERLIN',
      federalState: 'Berlin',
      mainLocationKey: 'mitte',
      multiManagerLocationKeys: ['mitte', 'kreuzberg'],
      locations: [
        {
          key: 'mitte',
          name: 'Berlin Mitte',
          city: 'Berlin',
          zip: '10115',
          street: 'Torstrasse 15',
          emailSlug: 'mitte',
          icon: 'restaurant',
        },
        {
          key: 'kreuzberg',
          name: 'Berlin Kreuzberg',
          city: 'Berlin',
          zip: '10997',
          street: 'Oranienstrasse 24',
          emailSlug: 'kreuzberg',
          icon: 'local_bar',
        },
        {
          key: 'charlottenburg',
          name: 'Berlin Charlottenburg',
          city: 'Berlin',
          zip: '10623',
          street: 'Kantstrasse 10',
          emailSlug: 'charlottenburg',
          icon: 'storefront',
        },
        {
          key: 'neukoelln',
          name: 'Berlin Neukölln',
          city: 'Berlin',
          zip: '12043',
          street: 'Karl-Marx-Strasse 88',
          emailSlug: 'neukoelln',
          icon: 'local_cafe',
        },
      ],
    },
  ];

  constructor(
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(DutyShift.name)
    private readonly dutyShiftModel: Model<DutyShiftDocument>,
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    @InjectModel(WeeklyMenu.name)
    private readonly weeklyMenuModel: Model<WeeklyMenuDocument>,
    @InjectModel(InternalMessage.name)
    private readonly internalMessageModel: Model<InternalMessageDocument>,
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    @InjectModel(InventoryBatch.name)
    private readonly inventoryBatchModel: Model<InventoryBatchDocument>,
    @InjectModel(PurchaseOrder.name)
    private readonly purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(Checklist.name)
    private readonly checklistModel: Model<ChecklistDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(Region.name)
    private readonly regionModel: Model<RegionDocument>,
    @InjectModel(Area.name)
    private readonly areaModel: Model<AreaDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(TenantModule.name)
    private readonly tenantModuleModel: Model<TenantModuleDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureDevelopmentPlatformAdmin();
    await this.ensureDevelopmentDemoTenants();
  }

  async seed(actor: AuthenticatedUser): Promise<DemoDataResult> {
    await this.clearExistingDemoData();

    const company = await this.companyModel.create({
      name: this.demoCompanyName,
      slug: this.slugify(this.demoCompanyName),
      type: 'restaurant-group',
      isActive: true,
    });
    const { departments, locations, locationsByKey, regionsByKey } =
      await this.createOrganization(company._id.toString(), actor.sub);
    const users = await this.createUsers(
      company._id.toString(),
      regionsByKey,
      locationsByKey,
      departments,
    );
    this.validateDemoUsers(users, locationsByKey);
    await this.assignLocationManagers(locations, users);

    const locationId = this.requireMapValue(
      locationsByKey,
      'bonn',
    )._id.toString();
    const primaryUsers = users.filter((user) =>
      (user.locationIds ?? []).includes(locationId),
    );
    const tables = await this.createTables(locationId);
    const menuItems = await this.createMenuItems();
    const orders = await this.createOrders(locationId, tables);
    const reservations = await this.createReservations(locationId, tables);
    const dutyShifts = await this.createDutyShifts(locationId, primaryUsers);
    const timeEntries = await this.createTimeEntries(locationId, primaryUsers);
    const weeklyMenus = await this.createWeeklyMenu(locationId, menuItems);
    const internalMessages = await this.createInternalMessages(
      locationId,
      actor,
    );
    const suppliers = await this.createSuppliers(locationId);
    const stockItems = await this.createStockItems(locationId, suppliers);
    const stockMovements = await this.createStockMovements(
      locationId,
      stockItems,
      actor,
    );
    const inventoryBatches = await this.createInventoryBatches(stockItems);
    const purchaseOrders = await this.createPurchaseOrders(
      locationId,
      stockItems,
      suppliers,
      actor,
    );
    const checklists = await this.createChecklists(locationId);

    return {
      locationId,
      created: {
        companies: 1,
        regions: regionsByKey.size,
        locations: locations.length,
        departments: departments.length,
        users: users.length,
        tables: tables.length,
        menuItems: menuItems.length,
        orders: orders.length,
        reservations: reservations.length,
        dutyShifts: dutyShifts.length,
        timeEntries: timeEntries.length,
        weeklyMenus: weeklyMenus.length,
        internalMessages: internalMessages.length,
        stockItems: stockItems.length,
        stockMovements: stockMovements.length,
        inventoryBatches: inventoryBatches.length,
        purchaseOrders: purchaseOrders.length,
        suppliers: suppliers.length,
        checklists: checklists.length,
      },
      demoUsers: users.map((user) => ({
        email: user.email,
        password: this.demoPassword,
        role: user.roles[0],
      })),
    };
  }

  async seedSalesDemo(): Promise<DemoDataResult> {
    const company = await this.companyModel
      .findOneAndUpdate(
        {
          $or: [
            { slug: this.slugify(this.salesDemoCompanyName) },
            { name: this.salesDemoCompanyName },
          ],
        },
        {
          $set: {
            name: this.salesDemoCompanyName,
            slug: this.slugify(this.salesDemoCompanyName),
            type: 'sales-demo-restaurant',
            isActive: true,
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();
    const companyId = company._id.toString();
    const region = await this.regionModel
      .findOneAndUpdate(
        { companyId, code: this.salesDemoRegionCode },
        {
          $set: {
            companyId,
            name: 'Nordrhein-Westfalen',
            code: this.salesDemoRegionCode,
            isActive: true,
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();
    const regionId = region._id.toString();
    const location = await this.upsertSalesDemoLocation(companyId, regionId);
    const locationId = location._id.toString();
    const departments = await this.upsertSalesDemoDepartments(
      companyId,
      locationId,
    );
    const tables = await this.upsertSalesDemoTables(
      companyId,
      regionId,
      locationId,
    );
    const menuItems = await this.upsertSalesDemoMenuItems();
    const users = await this.upsertSalesDemoUsers(
      companyId,
      regionId,
      locationId,
      departments,
    );
    await this.updateSalesDemoTableStatuses(locationId);
    const orders = await this.recreateSalesDemoOrders(
      companyId,
      locationId,
      tables,
      menuItems,
      users,
    );
    const reservations = await this.recreateSalesDemoReservations(
      locationId,
      tables,
    );
    const stockItems = await this.upsertSalesDemoStockItems(locationId);
    const stockMovements = await this.recreateSalesDemoStockMovements(
      locationId,
      stockItems,
      users[0]._id.toString(),
    );
    const timeEntries = await this.recreateSalesDemoTimeEntries(
      locationId,
      users,
    );
    const checklists = await this.upsertSalesDemoChecklists(locationId);
    const demoTenants = await this.ensureDevelopmentDemoTenants();

    return {
      locationId,
      created: {
        companies: 1,
        regions: 1,
        locations: 1,
        departments: departments.length,
        users: users.length,
        tables: tables.length,
        menuItems: menuItems.length,
        orders: orders.length,
        reservations: reservations.length,
        stockItems: stockItems.length,
        stockMovements: stockMovements.length,
        timeEntries: timeEntries.length,
        checklists: checklists.length,
        demoTenants: demoTenants.tenants,
        demoTenantAreas: demoTenants.areas,
        demoTenantRegions: demoTenants.regions,
        demoTenantLocations: demoTenants.locations,
        demoTenantUsers: demoTenants.users,
        demoTenantModules: demoTenants.modules,
      },
      demoUsers: users.map((user) => ({
        email: user.email,
        password: this.salesDemoPassword,
        role: user.roles[0],
      })),
    };
  }

  async ensureDevelopmentDemoTenants(): Promise<Record<string, number>> {
    if (process.env.NODE_ENV === 'production') {
      return {
        tenants: 0,
        areas: 0,
        regions: 0,
        locations: 0,
        users: 0,
        modules: 0,
      };
    }

    const passwordHash = await bcrypt.hash(this.tenantDemoPassword, 12);
    let areas = 0;
    let regions = 0;
    let locations = 0;
    let users = 0;
    let modules = 0;

    await this.hideLegacyDevelopmentDemoTenants();

    for (const config of this.developmentTenantConfigs) {
      const companySlug = `${config.slug}-demo-tenant`;
      const company = await this.companyModel
        .findOneAndUpdate(
          {
            $or: [
              { slug: companySlug },
              { name: `${config.name} Demo Tenant` },
            ],
          },
          {
            $set: {
              name: `${config.name} Demo Tenant`,
              slug: companySlug,
              type: 'development-demo-tenant',
              isActive: true,
            },
          },
          { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
      const tenant = await this.tenantModel
        .findOneAndUpdate(
          { slug: config.slug },
          {
            $set: {
              name: config.name,
              slug: config.slug,
              status: TenantStatus.Active,
              planKey: 'demo',
              licenseStatus: LicenseStatus.Active,
              billingStatus: BillingStatus.Paid,
              contactEmail: `admin@${config.slug}.demo`,
              contactPhone: '0221 123456',
              billingName: config.name,
              billingAddress: 'Demo Strasse 1, 50667 Koeln',
              companyId: company._id.toString(),
              deletedAt: null,
            },
          },
          { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
      const tenantId = tenant._id.toString();
      const companyId = company._id.toString();
      const areaByName = await this.upsertDevelopmentTenantAreas(
        tenantId,
        companyId,
      );
      const regionByName = await this.upsertDevelopmentTenantRegions(
        tenantId,
        companyId,
        areaByName,
      );
      const locationDocs = await this.upsertDevelopmentTenantLocations(
        tenantId,
        companyId,
        config,
        areaByName,
        regionByName,
      );
      const locationIds = locationDocs.map((location) => location._id.toString());
      const areaIds = [...areaByName.values()].map((area) => area._id.toString());
      const regionIds = [...regionByName.values()].map((region) =>
        region._id.toString(),
      );
      const tenantUsers = await this.upsertDevelopmentTenantUsers(
        config,
        tenantId,
        companyId,
        areaIds,
        regionIds,
        locationDocs,
        passwordHash,
      );

      await this.assignDevelopmentTenantLocationManagers(
        locationDocs,
        tenantUsers,
      );
      await this.upsertDevelopmentTenantModules(tenantId);

      areas += areaByName.size;
      regions += regionByName.size;
      locations += locationDocs.length;
      users += tenantUsers.length;
      modules += DEFAULT_MODULES.length;
    }

    return {
      tenants: this.developmentTenantConfigs.length,
      areas,
      regions,
      locations,
      users,
      modules,
    };
  }

  async ensureDevelopmentPlatformAdmin(): Promise<UserDocument | null> {
    if (process.env.NODE_ENV === 'production') {
      return null;
    }

    const passwordHash = await bcrypt.hash(
      this.developmentPlatformAdminPassword,
      12,
    );

    return this.userModel
      .findOneAndUpdate(
        { email: this.developmentPlatformAdminEmail },
        {
          $set: {
            email: this.developmentPlatformAdminEmail,
            passwordHash,
            firstName: 'Platform',
            lastName: 'Admin',
            roles: [Role.PlatformAdminCode],
            permissions: ['*'],
            isActive: true,
            status: 'active',
            tenantId: undefined,
            companyId: undefined,
            areaIds: [],
            regionIds: [],
            locationId: undefined,
            locationIds: [],
            managedLocationIds: [],
            departmentIds: [],
            responsibilities: [],
          },
        },
        {
          returnDocument: 'after',
          setDefaultsOnInsert: true,
          upsert: true,
        },
      )
      .exec();
  }

  private async upsertDevelopmentTenantAreas(
    tenantId: string,
    companyId: string,
  ): Promise<Map<string, AreaDocument>> {
    const result = new Map<string, AreaDocument>();

    for (const name of ['NRW', 'Bayern']) {
      const area = await this.areaModel
        .findOneAndUpdate(
          { tenantId, name },
          {
            $set: {
              tenantId,
              companyId,
              name,
              description: `${name} Demo-Bereich`,
              isActive: true,
            },
          },
          { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
      result.set(name, area);
    }

    return result;
  }

  private async upsertDevelopmentTenantRegions(
    tenantId: string,
    companyId: string,
    areaByName: Map<string, AreaDocument>,
  ): Promise<Map<string, RegionDocument>> {
    const configs = [
      { area: 'NRW', name: 'Rheinland', code: 'NRW-RHEINLAND' },
      { area: 'NRW', name: 'Ruhrgebiet', code: 'NRW-RUHR' },
      { area: 'Bayern', name: 'Oberbayern', code: 'BY-OBERBAYERN' },
      { area: 'Bayern', name: 'Franken', code: 'BY-FRANKEN' },
    ];
    const result = new Map<string, RegionDocument>();

    for (const config of configs) {
      const area = this.requireMapValue(areaByName, config.area);
      const region = await this.regionModel
        .findOneAndUpdate(
          { tenantId, code: config.code },
          {
            $set: {
              tenantId,
              companyId,
              areaId: area._id.toString(),
              name: config.name,
              code: config.code,
              description: `${config.name} Demo-Region`,
              isActive: true,
            },
          },
          { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
        )
        .exec();
      result.set(config.name, region);
    }

    return result;
  }

  private async upsertDevelopmentTenantLocations(
    tenantId: string,
    companyId: string,
    tenant: DevelopmentTenantConfig,
    areaByName: Map<string, AreaDocument>,
    regionByName: Map<string, RegionDocument>,
  ): Promise<LocationDocument[]> {
    return Promise.all(
      tenant.locations.map((location, index) => {
        const area = this.requireMapValue(areaByName, location.area);
        const region = this.requireMapValue(regionByName, location.region);
        const slug = `${tenant.slug}-${this.slugify(location.city)}`;

        return this.locationModel
          .findOneAndUpdate(
            { tenantId, slug },
            {
              $set: {
                tenantId,
                companyId,
                areaId: area._id.toString(),
                regionId: region._id.toString(),
                name: `${tenant.name} ${location.city}`,
                slug,
                address: `${location.street}, ${location.zip} ${location.city}`,
                street: location.street,
                zip: location.zip,
                postalCode: location.zip,
                city: location.city,
                federalState:
                  location.area === 'NRW' ? 'Nordrhein-Westfalen' : 'Bayern',
                phone: `0221 12345${index}`,
                email: `${this.slugify(location.city)}@${tenant.slug}.demo`,
                icon: 'restaurant',
                isActive: true,
                tablePlanFloors: ['EG'],
                tablePlanAreas: [
                  {
                    id: 'restaurant',
                    label: 'Restaurantbereich',
                    category: 'restaurant',
                    icon: 'table_restaurant',
                    floor: 'EG',
                    x: 5,
                    y: 8,
                    width: 48,
                    height: 48,
                  },
                  {
                    id: 'theke',
                    label: 'Theke',
                    category: 'bar',
                    icon: 'local_bar',
                    floor: 'EG',
                    x: 58,
                    y: 12,
                    width: 30,
                    height: 20,
                  },
                ],
              },
            },
            {
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec();
      }),
    );
  }

  private async upsertDevelopmentTenantUsers(
    tenant: DevelopmentTenantConfig,
    tenantId: string,
    companyId: string,
    areaIds: string[],
    regionIds: string[],
    locations: LocationDocument[],
    passwordHash: string,
  ): Promise<UserDocument[]> {
    const locationIds = locations.map((location) => location._id.toString());
    const configs: Array<{
      email: string;
      firstName: string;
      lastName: string;
      roles: Role[];
      locationIds: string[];
      managedLocationIds: string[];
    }> = [
      {
        email: `admin@${tenant.slug}.demo`,
        firstName: 'Admin',
        lastName: tenant.name,
        roles: [Role.TenantAdminCode],
        locationIds,
        managedLocationIds: locationIds,
      },
      {
        email: `regionalleiter@${tenant.slug}.demo`,
        firstName: 'Regionalleitung',
        lastName: tenant.name,
        roles: [Role.Regionalleiter],
        locationIds,
        managedLocationIds: locationIds,
      },
    ];

    for (const location of locations) {
      const citySlug = this.slugify(location.city);
      const locationId = location._id.toString();

      configs.push(
        {
          email: `filialleiter.${citySlug}@${tenant.slug}.demo`,
          firstName: 'Filialleitung',
          lastName: location.city,
          roles: [Role.Filialleiter],
          locationIds: [locationId],
          managedLocationIds: [locationId],
        },
        ...[1, 2].map((number) => ({
          email: `service${number}.${citySlug}@${tenant.slug}.demo`,
          firstName: `Service ${number}`,
          lastName: location.city,
          roles: [Role.Service],
          locationIds: [locationId],
          managedLocationIds: [],
        })),
        ...[1, 2].map((number) => ({
          email: `kueche${number}.${citySlug}@${tenant.slug}.demo`,
          firstName: `Kueche ${number}`,
          lastName: location.city,
          roles: [Role.Kueche],
          locationIds: [locationId],
          managedLocationIds: [],
        })),
      );
    }

    return Promise.all(
      configs.map((user) =>
        this.userModel
          .findOneAndUpdate(
            { email: user.email },
            {
              $set: {
                email: user.email,
                passwordHash,
                firstName: user.firstName,
                lastName: user.lastName,
                roles: user.roles,
                isActive: true,
                status: 'active',
                tenantId,
                companyId,
                areaIds,
                regionIds,
                locationId: user.locationIds[0],
                locationIds: user.locationIds,
                managedLocationIds: user.managedLocationIds,
                departmentIds: [],
                responsibilities: [],
              },
            },
            {
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec(),
      ),
    );
  }

  private async assignDevelopmentTenantLocationManagers(
    locations: LocationDocument[],
    users: UserDocument[],
  ): Promise<void> {
    await Promise.all(
      locations.map((location) => {
        const manager = users.find(
          (user) =>
            user.roles.includes(Role.Filialleiter) &&
            (user.managedLocationIds ?? []).includes(location._id.toString()),
        );

        if (!manager) {
          return Promise.resolve();
        }

        return this.locationModel
          .updateOne(
            { _id: location._id },
            { $set: { managerId: manager._id.toString() } },
          )
          .exec();
      }),
    );
  }

  private async upsertDevelopmentTenantModules(tenantId: string): Promise<void> {
    await Promise.all(
      DEFAULT_MODULES.map((moduleConfig) =>
        this.tenantModuleModel
          .findOneAndUpdate(
            { tenantId, moduleKey: moduleConfig.key },
            {
              $set: {
                tenantId,
                moduleKey: moduleConfig.key,
                enabled:
                  moduleConfig.systemLocked ||
                  this.tenantDemoActiveModuleKeys.has(moduleConfig.key),
              },
            },
            {
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec(),
      ),
    );
  }

  private async hideLegacyDevelopmentDemoTenants(): Promise<void> {
    await this.tenantModel
      .updateMany(
        {
          slug: {
            $in: [
              'hans-im-glueck',
              'kfc',
              'burger-king',
              'losteria',
              'frittenbude',
            ],
          },
          name: {
            $in: [
              'Hans im Glück',
              'Hans im Glueck',
              'KFC',
              'Burger King',
              "L'Osteria",
              'Frittenbude',
            ],
          },
          deletedAt: null,
        },
        {
          $set: {
            status: TenantStatus.Cancelled,
            licenseStatus: LicenseStatus.Suspended,
            billingStatus: BillingStatus.Blocked,
            deletedAt: new Date(),
          },
        },
      )
      .exec();
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private upsertSalesDemoLocation(
    companyId: string,
    regionId: string,
  ): Promise<LocationDocument> {
    return this.locationModel
      .findOneAndUpdate(
        { companyId, email: 'demo@gastrowerk24.de' },
        {
          $set: {
            name: this.salesDemoLocationName,
            street: 'Musterstraße 1',
            zip: '50667',
            city: 'Köln',
            federalState: 'Nordrhein-Westfalen',
            phone: '0221 123456',
            email: 'demo@gastrowerk24.de',
            icon: 'restaurant',
            isActive: true,
            companyId,
            regionId,
            tablePlanFloors: ['EG'],
            tablePlanAreas: [
              {
                id: 'restaurantbereich',
                label: 'Restaurantbereich',
                category: 'restaurant',
                icon: 'table_restaurant',
                floor: 'EG',
                x: 4,
                y: 8,
                width: 42,
                height: 40,
              },
              {
                id: 'terrasse',
                label: 'Terrasse',
                category: 'outdoor',
                icon: 'deck',
                floor: 'EG',
                x: 52,
                y: 8,
                width: 40,
                height: 34,
              },
              {
                id: 'lounge',
                label: 'Lounge',
                category: 'lounge',
                icon: 'weekend',
                floor: 'EG',
                x: 4,
                y: 58,
                width: 42,
                height: 28,
              },
              {
                id: 'theke',
                label: 'Theke',
                category: 'bar',
                icon: 'local_bar',
                floor: 'EG',
                x: 52,
                y: 58,
                width: 32,
                height: 22,
              },
            ],
            tablePlanObjects: [
              {
                id: 'demo-theke',
                label: 'Theke',
                kind: 'counter',
                icon: 'local_bar',
                x: 60,
                y: 66,
                width: 18,
                height: 8,
                rotation: 0,
                notes: 'Demo-Thekenbereich für Bar- und Thekenbestellungen',
              },
            ],
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();
  }

  private async upsertSalesDemoDepartments(
    companyId: string,
    locationId: string,
  ): Promise<DepartmentDocument[]> {
    const configs = [
      { name: 'Service', type: DepartmentType.Service },
      { name: 'Küche', type: DepartmentType.Kueche },
      { name: 'Lager', type: DepartmentType.Lager },
      { name: 'Spülküche', type: DepartmentType.Spuelkueche },
      { name: 'Reinigung', type: DepartmentType.Reinigung },
    ];

    return Promise.all(
      configs.map((config) =>
        this.departmentModel
          .findOneAndUpdate(
            { companyId, locationId, type: config.type },
            {
              $set: {
                companyId,
                locationId,
                name: config.name,
                type: config.type,
                isActive: true,
              },
            },
            {
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec(),
      ),
    );
  }

  private upsertSalesDemoTables(
    companyId: string,
    regionId: string,
    locationId: string,
  ): Promise<RestaurantTableDocument[]> {
    return Promise.all(
      Array.from({ length: 20 }, (_, index) => {
        const tableNumber = index + 1;
        const area =
          tableNumber <= 10
            ? 'Restaurantbereich'
            : tableNumber <= 15
              ? 'Terrasse'
              : 'Lounge';
        const areaIndex =
          tableNumber <= 10
            ? tableNumber - 1
            : tableNumber <= 15
              ? tableNumber - 11
              : tableNumber - 16;
        const baseX =
          area === 'Restaurantbereich' ? 9 : area === 'Terrasse' ? 57 : 10;
        const baseY =
          area === 'Restaurantbereich' ? 16 : area === 'Terrasse' ? 16 : 66;
        const columns = area === 'Restaurantbereich' ? 5 : 5;
        const planX = baseX + (areaIndex % columns) * 7;
        const planY = baseY + Math.floor(areaIndex / columns) * 12;
        const isRound = tableNumber % 3 === 0 || area === 'Terrasse';

        return this.tableModel
          .findOneAndUpdate(
            { locationId, name: `Tisch ${tableNumber}` },
            {
              $set: {
                companyId,
                regionId,
                tableNumber: String(tableNumber),
                tableName: `Tisch ${tableNumber}`,
                name: `Tisch ${tableNumber}`,
                locationId,
                seats: area === 'Lounge' ? 6 : tableNumber % 2 === 0 ? 4 : 2,
                area,
                icon: area === 'Terrasse' ? 'deck' : 'table_restaurant',
                status: TableStatus.Free,
                isActive: true,
                planX,
                planY,
                planWidth: isRound ? 9 : 12,
                planHeight: isRound ? 9 : 10,
                planRotation: 0,
                floorId: `${locationId}:eg`,
                floorName: 'EG',
                planFloor: 'EG',
                planShape: isRound ? TableShape.Round : TableShape.Rectangle,
              },
            },
            {
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec();
      }),
    );
  }

  private async updateSalesDemoTableStatuses(
    locationId: string,
  ): Promise<void> {
    const occupiedTables = ['Tisch 1', 'Tisch 2', 'Tisch 3', 'Tisch 11'];
    const reservedTables = ['Tisch 4', 'Tisch 12'];

    await Promise.all([
      this.tableModel
        .updateMany(
          { locationId, name: { $in: occupiedTables } },
          {
            $set: {
              status: TableStatus.Occupied,
              waitingSince: this.hoursAgo(1),
              lastStatusChange: this.hoursAgo(1),
            },
          },
        )
        .exec(),
      this.tableModel
        .updateMany(
          { locationId, name: { $in: reservedTables } },
          {
            $set: {
              status: TableStatus.Reserved,
              lastStatusChange: this.hoursAgo(2),
            },
          },
        )
        .exec(),
      this.tableModel
        .updateMany(
          {
            locationId,
            name: { $nin: [...occupiedTables, ...reservedTables] },
          },
          {
            $set: {
              status: TableStatus.Free,
              activeOrderIds: [],
              currentTotal: 0,
            },
            $unset: { waitingSince: '', lastStatusChange: '' },
          },
        )
        .exec(),
    ]);
  }

  private async recreateSalesDemoOrders(
    companyId: string,
    locationId: string,
    tables: RestaurantTableDocument[],
    menuItems: MenuItemDocument[],
    users: UserDocument[],
  ): Promise<OrderDocument[]> {
    await this.orderModel
      .deleteMany({ locationId, orderNumber: /^DEMO-SALES-/ })
      .exec();
    const itemByName = new Map(menuItems.map((item) => [item.name, item]));
    const tableByName = new Map(tables.map((table) => [table.name, table]));
    const employee = users.find((user) => user.roles.includes(Role.Service));
    const orders: Array<Record<string, unknown>> = [
      this.salesDemoOrder({
        companyId,
        locationId,
        orderNumber: 'DEMO-SALES-1001',
        table: tableByName.get('Tisch 1'),
        employee,
        status: OrderStatus.Preparing,
        paymentStatus: PaymentStatus.Open,
        minutesAgo: 45,
        items: [
          { menuItem: itemByName.get('Cheeseburger'), quantity: 2 },
          { menuItem: itemByName.get('Pommes'), quantity: 2 },
          { menuItem: itemByName.get('Coca Cola 0,33'), quantity: 2 },
        ],
      }),
      this.salesDemoOrder({
        companyId,
        locationId,
        orderNumber: 'DEMO-SALES-1002',
        table: tableByName.get('Tisch 2'),
        employee,
        status: OrderStatus.New,
        paymentStatus: PaymentStatus.Open,
        minutesAgo: 18,
        items: [
          { menuItem: itemByName.get('Burger Classic'), quantity: 1 },
          { menuItem: itemByName.get('Salat'), quantity: 1 },
          { menuItem: itemByName.get('Pils'), quantity: 2 },
        ],
      }),
      this.salesDemoOrder({
        companyId,
        locationId,
        orderNumber: 'DEMO-SALES-1003',
        table: tableByName.get('Tisch 11'),
        employee,
        source: OrderSource.Counter,
        status: OrderStatus.Ready,
        paymentStatus: PaymentStatus.Open,
        minutesAgo: 28,
        items: [
          { menuItem: itemByName.get('Cappuccino'), quantity: 2 },
          { menuItem: itemByName.get('Espresso'), quantity: 1 },
        ],
      }),
      this.salesDemoOrder({
        companyId,
        locationId,
        orderNumber: 'DEMO-SALES-1004',
        table: tableByName.get('Tisch 3'),
        employee,
        source: OrderSource.Counter,
        status: OrderStatus.Closed,
        paymentStatus: PaymentStatus.Paid,
        minutesAgo: 95,
        items: [
          { menuItem: itemByName.get('Weizen'), quantity: 2 },
          { menuItem: itemByName.get('Pommes'), quantity: 1 },
        ],
      }),
    ];
    const createdOrders = (await this.orderModel.insertMany(
      orders,
    )) as unknown as Array<OrderDocument & { createdAt?: Date }>;

    await Promise.all(
      createdOrders.map((order) =>
        this.tableModel
          .updateOne(
            { _id: order.tableId },
            {
              $addToSet: { activeOrderIds: order._id.toString() },
              $set: {
                currentTotal: order.total,
                waitingSince: order.createdAt,
              },
            },
          )
          .exec(),
      ),
    );

    return createdOrders as OrderDocument[];
  }

  private salesDemoOrder(config: {
    companyId: string;
    locationId: string;
    orderNumber: string;
    table?: RestaurantTableDocument;
    employee?: UserDocument;
    source?: OrderSource;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    minutesAgo: number;
    items: Array<{ menuItem?: MenuItemDocument; quantity: number }>;
  }): Record<string, unknown> {
    const createdAt = this.minutesAgo(config.minutesAgo);
    const items = config.items
      .filter(
        (item): item is { menuItem: MenuItemDocument; quantity: number } =>
          Boolean(item.menuItem),
      )
      .map(({ menuItem, quantity }) => ({
        menuItemId: menuItem._id.toString(),
        name: menuItem.name,
        quantity,
        price: menuItem.price,
        totalPrice: this.roundPrice(menuItem.price * quantity),
        note: menuItem.name === 'Salat' ? 'Ohne Zwiebeln' : undefined,
        isKitchenItem: menuItem.isKitchenItem,
        productionArea: menuItem.isKitchenItem
          ? ProductionArea.Kitchen
          : ProductionArea.Bar,
      }));
    const subtotal = this.roundPrice(
      items.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0),
    );
    const total = subtotal;

    return {
      companyId: config.companyId,
      locationId: config.locationId,
      orderNumber: config.orderNumber,
      source: config.source ?? OrderSource.Internal,
      tableId: config.table?._id.toString(),
      guestCount: config.table?.seats ?? 2,
      status: config.status,
      paymentStatus: config.paymentStatus,
      items,
      subtotal,
      tax: this.roundPrice(total * 0.19),
      total,
      employeeId: config.employee?._id.toString(),
      employeeName: config.employee
        ? `${config.employee.firstName ?? ''} ${config.employee.lastName ?? ''}`.trim()
        : 'Service Demo',
      createdBy: config.employee?._id.toString(),
      createdAt,
      updatedAt: createdAt,
      paidAt:
        config.paymentStatus === PaymentStatus.Paid
          ? this.minutesAgo(20)
          : undefined,
    };
  }

  private async recreateSalesDemoReservations(
    locationId: string,
    tables: RestaurantTableDocument[],
  ): Promise<ReservationDocument[]> {
    await this.reservationModel
      .deleteMany({
        locationId,
        guestEmail: /@gastromania-demo\.de$/,
      })
      .exec();
    const tableByName = new Map(tables.map((table) => [table.name, table]));
    const baseDate = new Date();
    const reservations: Array<Record<string, unknown>> = [
      this.salesDemoReservation({
        locationId,
        table: tableByName.get('Tisch 4'),
        guestName: 'Laura Schmitz',
        guestEmail: 'laura.schmitz@gastromania-demo.de',
        partySize: 4,
        startHour: 18,
        status: ReservationStatus.Confirmed,
        baseDate,
      }),
      this.salesDemoReservation({
        locationId,
        table: tableByName.get('Tisch 12'),
        guestName: 'David Becker',
        guestEmail: 'david.becker@gastromania-demo.de',
        partySize: 3,
        startHour: 19,
        status: ReservationStatus.Requested,
        baseDate,
      }),
      this.salesDemoReservation({
        locationId,
        table: tableByName.get('Tisch 16'),
        guestName: 'Mira Hoffmann',
        guestEmail: 'mira.hoffmann@gastromania-demo.de',
        partySize: 6,
        startHour: 20,
        status: ReservationStatus.Confirmed,
        baseDate,
      }),
    ];

    return this.reservationModel.insertMany(reservations) as unknown as Promise<
      ReservationDocument[]
    >;
  }

  private salesDemoReservation(config: {
    locationId: string;
    table?: RestaurantTableDocument;
    guestName: string;
    guestEmail: string;
    partySize: number;
    startHour: number;
    status: ReservationStatus;
    baseDate: Date;
  }): Record<string, unknown> {
    const startTime = new Date(config.baseDate);
    startTime.setHours(config.startHour, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setHours(startTime.getHours() + 2);

    return {
      locationId: config.locationId,
      tableId: config.table?._id.toString() ?? '',
      guestName: config.guestName,
      guestEmail: config.guestEmail,
      guestPhone: '0221 123456',
      partySize: config.partySize,
      startTime,
      endTime,
      status: config.status,
      notes: 'Sales-Demo-Reservierung',
    };
  }

  private upsertSalesDemoStockItems(
    locationId: string,
  ): Promise<StockItemDocument[]> {
    const items = [
      {
        name: 'Burger Buns',
        category: 'Trockenware',
        unit: 'Stück',
        quantity: 42,
        minQuantity: 20,
        purchasePriceNet: 0.65,
        storageLocation: 'Lager Regal A',
      },
      {
        name: 'Rinderhack',
        category: 'Fleisch',
        unit: 'kg',
        quantity: 7.5,
        minQuantity: 5,
        purchasePriceNet: 11.8,
        storageLocation: 'Kühlhaus 1',
      },
      {
        name: 'Cheddar',
        category: 'Molkerei',
        unit: 'Scheiben',
        quantity: 18,
        minQuantity: 25,
        purchasePriceNet: 0.28,
        storageLocation: 'Kühlhaus 1',
      },
      {
        name: 'Coca Cola 0,33',
        category: 'Getränke',
        unit: 'Flasche',
        quantity: 36,
        minQuantity: 24,
        purchasePriceNet: 0.85,
        storageLocation: 'Getränkelager',
      },
      {
        name: 'Kaffeebohnen',
        category: 'Kaffee',
        unit: 'kg',
        quantity: 3,
        minQuantity: 2,
        purchasePriceNet: 17.5,
        storageLocation: 'Barlager',
      },
    ];

    return Promise.all(
      items.map((item) =>
        this.stockItemModel
          .findOneAndUpdate(
            { locationId, name: item.name },
            {
              $set: {
                locationId,
                name: item.name,
                category: item.category,
                unit: item.unit,
                quantity: item.quantity,
                minQuantity: item.minQuantity,
                criticalQuantity: Math.max(1, item.minQuantity / 2),
                targetQuantity: item.minQuantity * 2,
                purchasePriceNet: item.purchasePriceNet,
                lastPurchasePrice: item.purchasePriceNet,
                averageCost: item.purchasePriceNet,
                unitCost: item.purchasePriceNet,
                purchasePriceGross: this.roundPrice(
                  item.purchasePriceNet * 1.19,
                ),
                storageLocation: item.storageLocation,
                requiresExpiryDate: ['Fleisch', 'Molkerei'].includes(
                  item.category,
                ),
                isActive: true,
                isArchived: false,
              },
            },
            {
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec(),
      ),
    );
  }

  private async recreateSalesDemoStockMovements(
    locationId: string,
    stockItems: StockItemDocument[],
    actorId: string,
  ): Promise<StockMovementDocument[]> {
    await this.stockMovementModel
      .deleteMany({ locationId, note: /^Sales-Demo-/ })
      .exec();

    return this.stockMovementModel.insertMany(
      stockItems.map((item, index) => ({
        locationId,
        stockItemId: item._id.toString(),
        stockItemName: item.name,
        type:
          index === 3
            ? StockMovementType.Shrinkage
            : index % 2 === 0
              ? StockMovementType.Receipt
              : StockMovementType.Usage,
        quantityChange: index % 2 === 0 ? 10 : -2,
        quantityBefore:
          index % 2 === 0 ? item.quantity - 10 : item.quantity + 2,
        quantityAfter: item.quantity,
        unitPriceNet: item.purchasePriceNet,
        valueNet: this.roundPrice(
          item.purchasePriceNet * (index % 2 === 0 ? 10 : 2),
        ),
        note: `Sales-Demo-${item.name}`,
        actorId,
      })),
    );
  }

  private async recreateSalesDemoTimeEntries(
    locationId: string,
    users: UserDocument[],
  ): Promise<TimeEntryDocument[]> {
    await this.timeEntryModel
      .deleteMany({ locationId, note: /^Sales-Demo-/ })
      .exec();
    const service = users.find((user) => user.roles.includes(Role.Service));
    const kitchen = users.find((user) => user.roles.includes(Role.Kueche));
    const manager = users.find((user) =>
      user.roles.includes(Role.Filialleiter),
    );

    return this.timeEntryModel.insertMany(
      [service, kitchen, manager]
        .filter((user): user is UserDocument => Boolean(user))
        .map((user, index) => ({
          locationId,
          employeeId: user._id.toString(),
          clockIn: this.hoursAgo(index === 0 ? 3 : 2),
          breakMinutes: index === 2 ? 30 : 15,
          note: `Sales-Demo-${user.email}`,
        })),
    );
  }

  private upsertSalesDemoChecklists(
    locationId: string,
  ): Promise<ChecklistDocument[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checklists = [
      {
        title: 'Sales-Demo Service Start',
        area: 'Service',
        roles: [Role.Service, Role.Filialleiter],
        tasks: [
          { title: 'Terrasse eindecken', isDone: true },
          { title: 'Reservierungen prüfen', isDone: false },
        ],
      },
      {
        title: 'Sales-Demo Küche Mise en Place',
        area: 'Küche',
        roles: [Role.Kueche, Role.Filialleiter],
        tasks: [
          { title: 'Burger-Station vorbereiten', isDone: true },
          { title: 'Kühlbestand prüfen', isDone: false },
          { title: 'Tagesangebot vorbereiten', isDone: false },
        ],
      },
    ];

    return Promise.all(
      checklists.map((checklist) =>
        this.checklistModel
          .findOneAndUpdate(
            { locationId, date: today, title: checklist.title },
            {
              $set: {
                locationId,
                date: today,
                title: checklist.title,
                area: checklist.area,
                roles: checklist.roles,
                status: ChecklistStatus.InProgress,
                tasks: checklist.tasks,
                note: 'Sales-Demo-Checkliste für Dashboard-Kennzahlen',
              },
            },
            {
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec(),
      ),
    );
  }

  private upsertSalesDemoMenuItems(): Promise<MenuItemDocument[]> {
    return Promise.all(
      this.salesDemoMenuItems.map((item) => {
        const theme = this.salesDemoCategoryTheme(item);

        return this.menuItemModel
          .findOneAndUpdate(
            { name: item.name, category: item.category },
            {
              $set: {
                name: item.name,
                category: item.category,
                description: item.description,
                ingredients: item.ingredients,
                weight: item.weight,
                price: item.price,
                sellingPrice: item.price,
                isKitchenItem: item.isKitchenItem,
                isVegan: item.isVegan ?? false,
                containsNuts: false,
                isActive: true,
                ...theme,
              },
            },
            {
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec();
      }),
    );
  }

  private salesDemoCategoryTheme(item: SalesDemoMenuItemConfig): {
    color: string;
    icon: string;
    backgroundColor: string;
    textColor: string;
    sortOrder: number;
  } {
    const name = item.name.toLocaleLowerCase('de-DE');

    if (name.includes('burger')) {
      return {
        color: '#7a4a22',
        icon: 'lunch_dining',
        backgroundColor: '#fff7ef',
        textColor: '#3b2412',
        sortOrder: 10,
      };
    }

    if (name.includes('salat')) {
      return {
        color: '#2e8b57',
        icon: 'eco',
        backgroundColor: '#f0fbf2',
        textColor: '#173d24',
        sortOrder: 40,
      };
    }

    if (item.category === 'Kaffee') {
      return {
        color: '#4c2d1f',
        icon: 'local_cafe',
        backgroundColor: '#f8f1ea',
        textColor: '#271306',
        sortOrder: 60,
      };
    }

    if (name.includes('pils') || name.includes('weizen')) {
      return {
        color: '#c99a13',
        icon: 'sports_bar',
        backgroundColor: '#fff9e8',
        textColor: '#483400',
        sortOrder: 80,
      };
    }

    if (item.category === 'Getränke') {
      return {
        color: '#1478cf',
        icon: 'local_drink',
        backgroundColor: '#eff8ff',
        textColor: '#08345d',
        sortOrder: 70,
      };
    }

    return {
      color: '#7a4a22',
      icon: 'restaurant',
      backgroundColor: '#fff7ef',
      textColor: '#3b2412',
      sortOrder: 15,
    };
  }

  private async upsertSalesDemoUsers(
    companyId: string,
    regionId: string,
    locationId: string,
    departments: DepartmentDocument[],
  ): Promise<UserDocument[]> {
    const passwordHash = await bcrypt.hash(this.salesDemoPassword, 12);
    const departmentIdsByType = new Map(
      departments.map((department) => [
        department.type,
        department._id.toString(),
      ]),
    );

    return Promise.all(
      this.salesDemoUsers.map((user) => {
        const isManager = [Role.Admin, Role.Filialleiter].includes(user.role);
        const departmentId = user.departmentType
          ? departmentIdsByType.get(user.departmentType)
          : undefined;

        return this.userModel
          .findOneAndUpdate(
            { email: user.email },
            {
              $set: {
                email: user.email,
                passwordHash,
                firstName: user.firstName,
                lastName: user.lastName,
                roles: [user.role],
                isActive: true,
                companyId,
                regionIds: [regionId],
                locationId,
                locationIds: [locationId],
                managedLocationIds: isManager ? [locationId] : [],
                departmentIds: departmentId ? [departmentId] : [],
                responsibilities: [],
              },
            },
            {
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec();
      }),
    );
  }

  private async clearExistingDemoData(): Promise<void> {
    const localDomainPattern =
      /@(nrw|hessen|bayern|berlin|bonn|koeln|essen|olpe|frankfurt|wiesbaden|kassel|darmstadt|muenchen|nuernberg|augsburg|regensburg|mitte|kreuzberg|charlottenburg|neukoelln|demo\.gastromania)\.local$/;
    const demoCompanies = await this.companyModel
      .find({
        $or: [
          { name: this.demoCompanyName },
          { name: new RegExp(`^\\${this.demoPrefix}`) },
        ],
      })
      .select('_id')
      .exec();
    const companyIds = demoCompanies.map((company) => company._id.toString());
    const demoLocations = await this.locationModel
      .find({
        $or: [
          { companyId: { $in: companyIds } },
          { name: new RegExp(`^\\${this.demoPrefix}`) },
        ],
      })
      .select('_id')
      .exec();
    const locationIds = demoLocations.map((location) =>
      location._id.toString(),
    );

    await Promise.all([
      this.orderModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.reservationModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.tableModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.dutyShiftModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.timeEntryModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.weeklyMenuModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.internalMessageModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.stockItemModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.stockMovementModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.inventoryBatchModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.purchaseOrderModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.supplierModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.checklistModel
        .deleteMany({ locationId: { $in: locationIds } })
        .exec(),
      this.departmentModel
        .deleteMany({
          $or: [
            { companyId: { $in: companyIds } },
            { locationId: { $in: locationIds } },
          ],
        })
        .exec(),
      this.locationModel.deleteMany({ _id: { $in: locationIds } }).exec(),
      this.regionModel
        .deleteMany({
          $or: [
            { companyId: { $in: companyIds } },
            { code: { $in: this.demoRegions.map((region) => region.code) } },
          ],
        })
        .exec(),
      this.companyModel
        .deleteMany({
          $or: [
            { name: this.demoCompanyName },
            { name: new RegExp(`^\\${this.demoPrefix}`) },
          ],
        })
        .exec(),
      this.menuItemModel
        .deleteMany({ name: new RegExp(`^\\${this.demoPrefix}`) })
        .exec(),
      this.userModel.deleteMany({ email: localDomainPattern }).exec(),
    ]);
  }

  private async createOrganization(companyId: string, actorId: string) {
    const regionsByKey = new Map<string, RegionDocument>();
    const locationsByKey = new Map<string, LocationDocument>();
    const locations: LocationDocument[] = [];
    const departments: DepartmentDocument[] = [];

    for (const regionConfig of this.demoRegions) {
      const region = await this.regionModel.create({
        companyId,
        name: regionConfig.name,
        code: regionConfig.code,
        isActive: true,
      });
      regionsByKey.set(regionConfig.key, region);

      for (const locationConfig of regionConfig.locations) {
        const location = await this.locationModel.create({
          name: locationConfig.name,
          street: locationConfig.street,
          zip: locationConfig.zip,
          city: locationConfig.city,
          federalState: regionConfig.federalState,
          phone: '+49 228 100000',
          email: `${locationConfig.emailSlug}@gastromania.local`,
          icon: locationConfig.icon,
          isActive: true,
          companyId,
          regionId: region._id.toString(),
          managerId: actorId,
        });
        locations.push(location);
        locationsByKey.set(locationConfig.key, location);
        departments.push(
          ...(await this.createDepartments(companyId, location._id.toString())),
        );
      }
    }

    return { departments, locations, locationsByKey, regionsByKey };
  }

  private createDepartments(
    companyId: string,
    locationId: string,
  ): Promise<DepartmentDocument[]> {
    return this.departmentModel.insertMany([
      { companyId, locationId, name: 'Service', type: DepartmentType.Service },
      { companyId, locationId, name: 'Kueche', type: DepartmentType.Kueche },
      { companyId, locationId, name: 'Lager', type: DepartmentType.Lager },
      {
        companyId,
        locationId,
        name: 'Spuelkueche',
        type: DepartmentType.Spuelkueche,
      },
      {
        companyId,
        locationId,
        name: 'Reinigung',
        type: DepartmentType.Reinigung,
      },
    ]);
  }

  private async createUsers(
    companyId: string,
    regionsByKey: Map<string, RegionDocument>,
    locationsByKey: Map<string, LocationDocument>,
    departments: DepartmentDocument[],
  ): Promise<UserDocument[]> {
    const passwordHash = await bcrypt.hash(this.demoPassword, 12);
    const users: Array<Partial<User>> = [];
    const departmentByLocationAndType = new Map<string, string>();
    departments.forEach((department) => {
      departmentByLocationAndType.set(
        `${department.locationId}:${department.type}`,
        department._id.toString(),
      );
    });

    for (const regionConfig of this.demoRegions) {
      const region = this.requireMapValue(regionsByKey, regionConfig.key);
      const regionId = region._id.toString();
      const regionLocations = regionConfig.locations.map((location) =>
        this.requireMapValue(locationsByKey, location.key),
      );
      const regionLocationIds = regionLocations.map((location) =>
        location._id.toString(),
      );
      const managedLocationIds = regionConfig.multiManagerLocationKeys.map(
        (locationKey) =>
          this.requireMapValue(locationsByKey, locationKey)._id.toString(),
      );
      const mainLocation = this.requireMapValue(
        locationsByKey,
        regionConfig.mainLocationKey,
      );
      const mainLocationId = mainLocation._id.toString();

      users.push(
        this.createDemoUser({
          email: `admin@${regionConfig.key}.local`,
          firstName: 'Admin',
          lastName: regionConfig.name,
          roles: [Role.RegionAdmin],
          companyId,
          regionIds: [regionId],
          locationIds: regionLocationIds,
          managedLocationIds: regionLocationIds,
          passwordHash,
        }),
        this.createDemoUser({
          email: `regionalleiter@${regionConfig.key}.local`,
          firstName: 'Regionalleitung',
          lastName: regionConfig.name,
          roles: [Role.Regionalleiter],
          companyId,
          regionIds: [regionId],
          locationIds: regionLocationIds,
          managedLocationIds: regionLocationIds,
          passwordHash,
        }),
        this.createDemoUser({
          email: `bereichsleiter@${regionConfig.key}.local`,
          firstName: 'Bereichsleitung',
          lastName: regionConfig.name,
          roles: [Role.Bereichsleiter],
          companyId,
          regionIds: [regionId],
          locationIds: managedLocationIds,
          managedLocationIds,
          passwordHash,
        }),
      );

      for (const locationConfig of regionConfig.locations) {
        const location = this.requireMapValue(
          locationsByKey,
          locationConfig.key,
        );
        const locationId = location._id.toString();
        const assignedLocationIds =
          locationConfig.key === regionConfig.mainLocationKey
            ? managedLocationIds
            : [locationId];

        users.push(
          this.createDemoUser({
            email: `filialleiter@${locationConfig.emailSlug}.local`,
            firstName: 'Filialleitung',
            lastName: locationConfig.name,
            roles: [Role.Filialleiter],
            companyId,
            regionIds: [regionId],
            locationIds: assignedLocationIds,
            managedLocationIds: assignedLocationIds,
            passwordHash,
          }),
        );
      }

      users.push(
        this.createOperationalUser(
          'service',
          Role.Service,
          DepartmentType.Service,
          regionConfig,
          regionId,
          companyId,
          mainLocationId,
          departmentByLocationAndType,
          passwordHash,
        ),
        this.createOperationalUser(
          'kueche',
          Role.Kueche,
          DepartmentType.Kueche,
          regionConfig,
          regionId,
          companyId,
          mainLocationId,
          departmentByLocationAndType,
          passwordHash,
        ),
        this.createOperationalUser(
          'lager',
          Role.Lager,
          DepartmentType.Lager,
          regionConfig,
          regionId,
          companyId,
          mainLocationId,
          departmentByLocationAndType,
          passwordHash,
        ),
        this.createOperationalUser(
          'spuelkueche',
          Role.Tellerwaescher,
          DepartmentType.Spuelkueche,
          regionConfig,
          regionId,
          companyId,
          mainLocationId,
          departmentByLocationAndType,
          passwordHash,
        ),
        this.createOperationalUser(
          'reinigung',
          Role.Reinigung,
          DepartmentType.Reinigung,
          regionConfig,
          regionId,
          companyId,
          mainLocationId,
          departmentByLocationAndType,
          passwordHash,
        ),
      );
    }

    return this.userModel.insertMany(users as User[]);
  }

  private createDemoUser(user: {
    email: string;
    firstName: string;
    lastName: string;
    roles: Role[];
    companyId: string;
    regionIds: string[];
    locationIds: string[];
    managedLocationIds: string[];
    passwordHash: string;
    departmentIds?: string[];
  }): Partial<User> {
    return {
      ...user,
      isActive: true,
      locationId: user.locationIds[0],
      departmentIds: user.departmentIds ?? [],
      responsibilities: [],
    };
  }

  private createOperationalUser(
    prefix: string,
    role: Role,
    departmentType: DepartmentType,
    regionConfig: DemoRegionConfig,
    regionId: string,
    companyId: string,
    locationId: string,
    departmentByLocationAndType: Map<string, string>,
    passwordHash: string,
  ): Partial<User> {
    const departmentId = departmentByLocationAndType.get(
      `${locationId}:${departmentType}`,
    );

    return this.createDemoUser({
      email: `${prefix}@${this.getMainLocationSlug(regionConfig)}.local`,
      firstName: this.capitalize(prefix),
      lastName: regionConfig.name,
      roles: [role],
      companyId,
      regionIds: [regionId],
      locationIds: [locationId],
      managedLocationIds: [],
      passwordHash,
      departmentIds: departmentId ? [departmentId] : [],
    });
  }

  private async assignLocationManagers(
    locations: LocationDocument[],
    users: UserDocument[],
  ): Promise<void> {
    const filialleiterByLocation = new Map<string, string>();

    users
      .filter((user) => user.roles.includes(Role.Filialleiter))
      .forEach((user) => {
        for (const locationId of user.managedLocationIds ??
          user.locationIds ??
          []) {
          if (!filialleiterByLocation.has(locationId)) {
            filialleiterByLocation.set(locationId, user._id.toString());
          }
        }
      });

    await Promise.all(
      locations.map((location) => {
        const managerId = filialleiterByLocation.get(location._id.toString());
        if (!managerId) {
          return Promise.resolve(location);
        }

        location.managerId = managerId;
        return location.save();
      }),
    );
  }

  private validateDemoUsers(
    users: UserDocument[],
    locationsByKey: Map<string, LocationDocument>,
  ): void {
    const usersByEmail = new Map<string, UserDocument>();

    users.forEach((user) => {
      if (usersByEmail.has(user.email)) {
        throw new Error(`Doppelter Demo-Account: ${user.email}`);
      }

      if (!user.passwordHash || 'password' in user) {
        throw new Error(`Ungueltiger Passwort-Seed fuer ${user.email}`);
      }

      usersByEmail.set(user.email, user);
    });

    for (const regionConfig of this.demoRegions) {
      const regionLocationKeys = regionConfig.locations.map(
        (location) => location.key,
      );
      const managedLocationKeys = regionConfig.multiManagerLocationKeys;
      const mainLocation = this.getMainLocationConfig(regionConfig);

      this.assertUserScope(
        usersByEmail,
        `admin@${regionConfig.key}.local`,
        [Role.RegionAdmin],
        regionLocationKeys,
        regionLocationKeys,
        locationsByKey,
      );
      this.assertUserScope(
        usersByEmail,
        `regionalleiter@${regionConfig.key}.local`,
        [Role.Regionalleiter],
        regionLocationKeys,
        regionLocationKeys,
        locationsByKey,
      );
      this.assertUserScope(
        usersByEmail,
        `bereichsleiter@${regionConfig.key}.local`,
        [Role.Bereichsleiter],
        managedLocationKeys,
        managedLocationKeys,
        locationsByKey,
      );

      for (const locationConfig of regionConfig.locations) {
        const locationKeys =
          locationConfig.key === regionConfig.mainLocationKey
            ? managedLocationKeys
            : [locationConfig.key];

        this.assertUserScope(
          usersByEmail,
          `filialleiter@${locationConfig.emailSlug}.local`,
          [Role.Filialleiter],
          locationKeys,
          locationKeys,
          locationsByKey,
        );
      }

      [
        ['service', Role.Service],
        ['kueche', Role.Kueche],
        ['lager', Role.Lager],
        ['spuelkueche', Role.Tellerwaescher],
        ['reinigung', Role.Reinigung],
      ].forEach(([prefix, role]) => {
        this.assertUserScope(
          usersByEmail,
          `${prefix}@${mainLocation.emailSlug}.local`,
          [role as Role],
          [mainLocation.key],
          [],
          locationsByKey,
        );
      });
    }
  }

  private assertUserScope(
    usersByEmail: Map<string, UserDocument>,
    email: string,
    roles: Role[],
    locationKeys: string[],
    managedLocationKeys: string[],
    locationsByKey: Map<string, LocationDocument>,
  ): void {
    const user = usersByEmail.get(email);

    if (!user) {
      throw new Error(`Demo-Account fehlt: ${email}`);
    }

    if (!this.sameValues(user.roles, roles)) {
      throw new Error(`Falsche Rolle fuer Demo-Account: ${email}`);
    }

    const locationIds = locationKeys.map((key) =>
      this.requireMapValue(locationsByKey, key)._id.toString(),
    );
    const managedLocationIds = managedLocationKeys.map((key) =>
      this.requireMapValue(locationsByKey, key)._id.toString(),
    );

    if (!this.sameValues(user.locationIds ?? [], locationIds)) {
      throw new Error(`Falsche Standort-Zuweisung fuer Demo-Account: ${email}`);
    }

    if (!this.sameValues(user.managedLocationIds ?? [], managedLocationIds)) {
      throw new Error(`Falsche Managed-Standorte fuer Demo-Account: ${email}`);
    }
  }

  private requireMapValue<T>(map: Map<string, T>, key: string): T {
    const value = map.get(key);
    if (!value) {
      throw new Error(`Demo-Datensatz fehlt: ${key}`);
    }

    return value;
  }

  private getMainLocationConfig(
    regionConfig: DemoRegionConfig,
  ): DemoLocationConfig {
    return this.requireMapValue(
      new Map(
        regionConfig.locations.map((location) => [location.key, location]),
      ),
      regionConfig.mainLocationKey,
    );
  }

  private getMainLocationSlug(regionConfig: DemoRegionConfig): string {
    return this.getMainLocationConfig(regionConfig).emailSlug;
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  private sameValues(first: string[], second: string[]): boolean {
    const normalize = (values: string[]) => [...new Set(values)].sort();

    return (
      JSON.stringify(normalize(first)) === JSON.stringify(normalize(second))
    );
  }

  private createTables(locationId: string): Promise<RestaurantTableDocument[]> {
    return this.tableModel.insertMany(
      [
        {
          name: 'Tisch 1',
          locationId,
          seats: 2,
          area: 'Fenster',
          icon: 'window',
          status: TableStatus.Occupied,
          planX: 8,
          planY: 16,
          planWidth: 12,
          planHeight: 12,
          planShape: TableShape.Round,
          isActive: true,
        },
        {
          name: 'Tisch 2',
          locationId,
          seats: 4,
          area: 'Innenraum',
          icon: 'table_restaurant',
          status: TableStatus.Reserved,
          planX: 28,
          planY: 18,
          planWidth: 14,
          planHeight: 11,
          planShape: TableShape.Rectangle,
          isActive: true,
        },
        {
          name: 'Tisch 3',
          locationId,
          seats: 4,
          area: 'Innenraum',
          icon: 'chair',
          status: TableStatus.Available,
          planX: 48,
          planY: 18,
          planWidth: 14,
          planHeight: 11,
          planShape: TableShape.Rectangle,
          isActive: true,
        },
        {
          name: 'Tisch 4',
          locationId,
          seats: 6,
          area: 'Terrasse',
          icon: 'deck',
          status: TableStatus.Available,
          planX: 72,
          planY: 20,
          planWidth: 16,
          planHeight: 12,
          planShape: TableShape.Rectangle,
          isActive: true,
        },
        {
          name: 'Bar 1',
          locationId,
          seats: 2,
          area: 'Bar',
          icon: 'local_bar',
          status: TableStatus.Occupied,
          planX: 8,
          planY: 72,
          planWidth: 24,
          planHeight: 10,
          planShape: TableShape.Bar,
          isActive: true,
        },
        {
          name: 'Tisch 5',
          locationId,
          seats: 2,
          area: 'Innenraum',
          icon: 'chair',
          status: TableStatus.Available,
          planX: 26,
          planY: 48,
          planWidth: 12,
          planHeight: 12,
          planShape: TableShape.Square,
          isActive: true,
        },
        {
          name: 'Tisch 6',
          locationId,
          seats: 4,
          area: 'Terrasse',
          icon: 'deck',
          status: TableStatus.Reserved,
          planX: 70,
          planY: 48,
          planWidth: 16,
          planHeight: 12,
          planShape: TableShape.Rectangle,
          isActive: true,
        },
        {
          name: 'Tisch 7',
          locationId,
          seats: 8,
          area: 'Separee',
          icon: 'groups',
          status: TableStatus.Available,
          planX: 46,
          planY: 68,
          planWidth: 20,
          planHeight: 13,
          planShape: TableShape.Rectangle,
          isActive: true,
        },
        {
          name: 'Tisch 8',
          locationId,
          seats: 2,
          area: 'Fenster',
          icon: 'window',
          status: TableStatus.Available,
          planX: 8,
          planY: 38,
          planWidth: 12,
          planHeight: 12,
          planShape: TableShape.Round,
          isActive: true,
        },
      ].map((table) => ({
        ...table,
        floorId: `${locationId}:eg`,
        floorName: 'EG',
        planFloor: 'EG',
      })),
    );
  }

  private createMenuItems(): Promise<MenuItemDocument[]> {
    return this.menuItemModel.insertMany([
      {
        name: `${this.demoPrefix} Avocado Bowl`,
        category: 'Hauptgerichte',
        description: 'Frische Bowl mit Quinoa, Avocado und Kräuter-Dressing',
        ingredients: 'Quinoa, Avocado, Gurke, Tomate, Kräuter',
        weight: '420 g',
        price: 12.9,
        isKitchenItem: true,
        isVegan: true,
        containsNuts: false,
        isActive: true,
      },
      {
        name: `${this.demoPrefix} Rinderburger`,
        category: 'Burger',
        description: 'Hausgemachter Burger mit Pommes',
        ingredients: 'Rind, Brioche, Salat, Tomate, Cheddar',
        weight: '520 g',
        price: 15.5,
        isKitchenItem: true,
        isVegan: false,
        containsNuts: false,
        isActive: true,
      },
      {
        name: `${this.demoPrefix} Kürbissuppe`,
        category: 'Suppen',
        description: 'Cremige Suppe mit Ingwer',
        ingredients: 'Kürbis, Ingwer, Kokosmilch',
        weight: '300 ml',
        price: 7.2,
        isKitchenItem: true,
        isVegan: true,
        containsNuts: false,
        isActive: true,
      },
      {
        name: `${this.demoPrefix} Tiramisu`,
        category: 'Desserts',
        description: 'Klassisches Dessert im Glas',
        ingredients: 'Mascarpone, Kaffee, Biskuit',
        weight: '180 g',
        price: 6.8,
        isKitchenItem: false,
        isVegan: false,
        containsNuts: false,
        isActive: true,
      },
      {
        name: `${this.demoPrefix} Hauslimonade`,
        category: 'Getränke',
        description: 'Zitrone, Minze und Soda',
        ingredients: 'Zitrone, Minze, Soda',
        weight: '400 ml',
        price: 4.5,
        isKitchenItem: false,
        isVegan: true,
        containsNuts: false,
        isActive: true,
      },
    ]);
  }

  private createOrders(
    locationId: string,
    tables: RestaurantTableDocument[],
  ): Promise<OrderDocument[]> {
    const baseOrders = [
      {
        locationId,
        orderNumber: 'B0001',
        tableId: tables[0]._id.toString(),
        status: OrderStatus.Preparing,
        items: [
          {
            name: `${this.demoPrefix} Rinderburger`,
            quantity: 2,
            price: 15.5,
            isKitchenItem: true,
          },
          {
            name: `${this.demoPrefix} Hauslimonade`,
            quantity: 2,
            price: 4.5,
            isKitchenItem: false,
          },
        ],
        total: 40,
        notes: 'Demo-Bestellung für Küchenboard',
      },
      {
        locationId,
        orderNumber: 'B0002',
        tableId: tables[4]._id.toString(),
        status: OrderStatus.Ready,
        items: [
          {
            name: `${this.demoPrefix} Kürbissuppe`,
            quantity: 1,
            price: 7.2,
            isKitchenItem: true,
          },
          {
            name: `${this.demoPrefix} Tiramisu`,
            quantity: 1,
            price: 6.8,
            isKitchenItem: false,
          },
        ],
        total: 14,
        notes: 'Kann serviert werden',
      },
      {
        locationId,
        orderNumber: 'B0003',
        tableId: tables[1]._id.toString(),
        status: OrderStatus.New,
        items: [
          {
            name: `${this.demoPrefix} Avocado Bowl`,
            quantity: 3,
            price: 12.9,
            isKitchenItem: true,
          },
        ],
        total: 38.7,
      },
    ];

    return this.orderModel.insertMany([
      ...baseOrders,
      ...this.createGeneratedOrders(locationId, tables, 50),
    ]);
  }

  private createGeneratedOrders(
    locationId: string,
    tables: RestaurantTableDocument[],
    count: number,
  ) {
    const menuItems = [
      {
        name: `${this.demoPrefix} Avocado Bowl`,
        price: 12.9,
        isKitchenItem: true,
      },
      {
        name: `${this.demoPrefix} Rinderburger`,
        price: 15.5,
        isKitchenItem: true,
      },
      {
        name: `${this.demoPrefix} Kürbissuppe`,
        price: 7.2,
        isKitchenItem: true,
      },
      { name: `${this.demoPrefix} Tiramisu`, price: 6.8, isKitchenItem: false },
      {
        name: `${this.demoPrefix} Hauslimonade`,
        price: 4.5,
        isKitchenItem: false,
      },
    ];
    const statuses = [
      OrderStatus.New,
      OrderStatus.Preparing,
      OrderStatus.Ready,
      OrderStatus.Served,
      OrderStatus.Served,
      OrderStatus.Cancelled,
    ];
    const notes = [
      'Ohne Zwiebeln',
      'Extra Besteck',
      'Allergene prüfen',
      'Kinderportion',
      'Schnell servieren',
      'Getränke zuerst',
      'Dessert später',
      'Terrasse',
    ];

    return Array.from({ length: count }, (_, index) => {
      const firstItem = menuItems[index % menuItems.length];
      const secondItem = menuItems[(index + 2) % menuItems.length];
      const items = [
        {
          name: firstItem.name,
          quantity: (index % 3) + 1,
          price: firstItem.price,
          isKitchenItem: firstItem.isKitchenItem,
        },
        {
          name: secondItem.name,
          quantity: ((index + 1) % 2) + 1,
          price: secondItem.price,
          isKitchenItem: secondItem.isKitchenItem,
        },
      ];

      if (index % 4 === 0) {
        const extraItem = menuItems[(index + 4) % menuItems.length];
        items.push({
          name: extraItem.name,
          quantity: 1,
          price: extraItem.price,
          isKitchenItem: extraItem.isKitchenItem,
        });
      }

      const total = Number(
        items
          .reduce((sum, item) => sum + item.quantity * item.price, 0)
          .toFixed(2),
      );
      const orderNumber = String(index + 1).padStart(2, '0');

      return {
        locationId,
        orderNumber: `B${String(index + 4).padStart(4, '0')}`,
        tableId: tables[index % tables.length]._id.toString(),
        status: statuses[index % statuses.length],
        items,
        total,
        notes: `${this.demoPrefix} Zusatzbestellung ${orderNumber} - ${
          notes[index % notes.length]
        }`,
      };
    });
  }

  private createReservations(
    locationId: string,
    tables: RestaurantTableDocument[],
  ): Promise<ReservationDocument[]> {
    const today = new Date();

    return this.reservationModel.insertMany([
      {
        guestName: `${this.demoPrefix} Familie Berger`,
        guestPhone: '+49 30 222222',
        guestEmail: 'berger@example.test',
        locationId,
        tableId: tables[1]._id.toString(),
        partySize: 4,
        startTime: this.atTime(today, 18, 30),
        endTime: this.atTime(today, 20, 30),
        status: ReservationStatus.Confirmed,
        notes: 'Kinderstuhl vorbereiten',
      },
      {
        guestName: `${this.demoPrefix} Team Lunch`,
        guestPhone: '+49 30 333333',
        locationId,
        tableId: tables[3]._id.toString(),
        partySize: 6,
        startTime: this.atTime(today, 12, 15),
        endTime: this.atTime(today, 13, 45),
        status: ReservationStatus.CheckedIn,
      },
    ]);
  }

  private createDutyShifts(
    locationId: string,
    users: UserDocument[],
  ): Promise<DutyShiftDocument[]> {
    const weekStart = this.getMonday(new Date());
    const usersByRole = new Map<Role, UserDocument | undefined>(
      Object.values(Role).map((role) => [
        role,
        users.find((user) => user.roles.includes(role)),
      ]),
    );
    const shifts: Array<{
      locationId: string;
      employeeId: string;
      role: Role;
      startTime: Date;
      endTime: Date;
      note: string;
    }> = [];
    const addShift = (
      role: Role,
      dayOffset: number,
      startHour: number,
      endHour: number,
      note: string,
    ) => {
      const user = usersByRole.get(role);

      if (!user) {
        return;
      }

      shifts.push({
        locationId,
        employeeId: user._id.toString(),
        role,
        startTime: this.atWeekDayTime(weekStart, dayOffset, startHour, 0),
        endTime: this.atWeekDayTime(weekStart, dayOffset, endHour, 0),
        note: `${this.demoPrefix} ${note}`,
      });
    };

    for (let day = 0; day < 7; day += 1) {
      addShift(
        Role.Service,
        day,
        day < 5 ? 10 : 11,
        day < 5 ? 16 : 17,
        'Service Mittag',
      );
      addShift(Role.Kueche, day, 8, day < 5 ? 15 : 16, 'Küche Vorbereitung');

      if (day < 5) {
        addShift(Role.Filialleiter, day, 9, 17, 'Filialleitung');
      }

      if ([0, 2, 4].includes(day)) {
        addShift(Role.Lager, day, 7, 13, 'Lager und Wareneingang');
      }

      if (day >= 1) {
        addShift(
          Role.Tellerwaescher,
          day,
          day < 5 ? 12 : 11,
          day < 5 ? 20 : 19,
          'Spülküche',
        );
      }
    }

    return this.dutyShiftModel.insertMany(shifts);
  }

  private createTimeEntries(
    locationId: string,
    users: UserDocument[],
  ): Promise<TimeEntryDocument[]> {
    const today = new Date();

    return this.timeEntryModel.insertMany([
      {
        locationId,
        employeeId: users[1]._id.toString(),
        clockIn: this.atTime(today, 9, 2),
        breakMinutes: 30,
        note: `${this.demoPrefix} aktuell im Dienst`,
      },
      {
        locationId,
        employeeId: users[2]._id.toString(),
        clockIn: this.atTime(today, 10, 0),
        clockOut: this.atTime(today, 15, 30),
        breakMinutes: 20,
        note: `${this.demoPrefix} abgeschlossene Schicht`,
      },
    ]);
  }

  private createWeeklyMenu(
    locationId: string,
    menuItems: MenuItemDocument[],
  ): Promise<WeeklyMenuDocument[]> {
    const weekStart = this.getMonday(new Date());
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(weekStart.getDate() + 7);

    return this.weeklyMenuModel.insertMany([
      {
        locationId,
        title: `${this.demoPrefix} Wochenkarte aktuell`,
        weekStart,
        note: 'Tages- und Mittagsmenüs für die aktuelle Demo-Woche',
        isActive: true,
        days: this.createDemoWeeklyMenuDays(weekStart, menuItems, 0),
      },
      {
        locationId,
        title: `${this.demoPrefix} Wochenkarte nächste Woche`,
        weekStart: nextWeekStart,
        note: 'Planbare Demo-Wochenkarte mit Tagesangeboten',
        isActive: true,
        days: this.createDemoWeeklyMenuDays(nextWeekStart, menuItems, 1),
      },
    ]);
  }

  private createDemoWeeklyMenuDays(
    weekStart: Date,
    menuItems: MenuItemDocument[],
    variant: number,
  ) {
    const dayTitles = [
      'Montagsangebot',
      'Dienstagsklassiker',
      'Mittwochsteller',
      'Donnerstagslunch',
      'Freitagskarte',
      'Samstagsangebot',
      'Sonntagsspecial',
    ];
    const descriptions = [
      'Leichter Start in die Woche mit frischen Zutaten.',
      'Beliebte Klassiker für den schnellen Mittagstisch.',
      'Ausgewogene Tageskarte mit wechselnder Beilage.',
      'Kompaktes Mittagsmenü für die Servicezeit.',
      'Kräftiges Angebot für die umsatzstarke Schicht.',
      'Wochenendkarte mit Dessertoption.',
      'Ruhiges Angebot für Familien und Reservierungen.',
    ];

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const selectedItems = [
        menuItems[(index + variant) % menuItems.length],
        menuItems[(index + variant + 2) % menuItems.length],
      ];

      if (index % 3 === 0) {
        selectedItems.push(menuItems[(index + variant + 4) % menuItems.length]);
      }

      const dailyMenuItems = selectedItems.map((item, itemIndex) => ({
        menuItemId: item._id.toString(),
        price: this.roundPrice(
          Math.max(item.price - (itemIndex === 0 ? 1.5 : 0.7), 1),
        ),
      }));
      const price = this.roundPrice(
        dailyMenuItems.reduce((sum, item) => sum + item.price, 0),
      );
      const menuType: 'Tagesmenü' | 'Mittagsmenü' =
        index % 2 === 0 ? 'Tagesmenü' : 'Mittagsmenü';

      return {
        date,
        menuType,
        title: `${this.demoPrefix} ${dayTitles[index]}`,
        description: descriptions[index],
        menuItemIds: selectedItems.map((item) => item._id.toString()),
        menuItems: dailyMenuItems,
        price,
        isVegetarian: selectedItems.every((item) => item.isVegan),
        isActive: true,
      };
    });
  }

  private createInternalMessages(
    locationId: string,
    actor: AuthenticatedUser,
  ): Promise<InternalMessageDocument[]> {
    return this.internalMessageModel.insertMany([
      {
        locationId,
        senderId: actor.sub,
        senderName: 'Demo Admin',
        senderRoles: actor.roles as Role[],
        targetRoles: [Role.Service],
        message: 'Bitte Tisch 2 für die Reservierung vorbereiten.',
        priority: InternalMessagePriority.Important,
      },
      {
        locationId,
        senderId: actor.sub,
        senderName: 'Demo Admin',
        senderRoles: actor.roles as Role[],
        targetRoles: [Role.Kueche],
        message: 'Demo: Burger-Bestellung priorisieren.',
        priority: InternalMessagePriority.Normal,
      },
    ]);
  }

  private createSuppliers(locationId: string): Promise<SupplierDocument[]> {
    return this.supplierModel.insertMany([
      {
        locationId,
        name: 'Demo Großhandel',
        contactName: 'Nora Einkauf',
        phone: '+49 30 444444',
        email: 'bestellung@demo-grosshandel.test',
        deliveryDays: 'Mo, Mi, Fr',
        orderDeadline: 'Vortag 16:00',
        minimumOrderValue: '150 EUR',
        customerNumber: 'GM-DEMO-1001',
        city: 'Berlin',
        isActive: true,
      },
      {
        locationId,
        name: 'Frischemarkt Demo',
        contactName: 'Ali Frische',
        phone: '+49 30 555555',
        email: 'frische@example.test',
        deliveryDays: 'täglich außer Sonntag',
        orderDeadline: 'bis 10:00 für Folgetag',
        minimumOrderValue: '80 EUR',
        customerNumber: 'FR-2042',
        city: 'Berlin',
        isActive: true,
      },
      {
        locationId,
        name: 'Demo Getränkelogistik',
        contactName: 'Mara Sprudel',
        phone: '+49 30 610001',
        email: 'orders@getraenke-demo.test',
        deliveryDays: 'Di, Do, Sa',
        orderDeadline: 'Vortag 14:00',
        minimumOrderValue: '120 EUR',
        customerNumber: 'GET-3010',
        city: 'Berlin',
        isActive: true,
      },
      {
        locationId,
        name: 'Biohof Demo',
        contactName: 'Lea Bio',
        phone: '+49 30 610002',
        email: 'verkauf@biohof-demo.test',
        deliveryDays: 'Mo, Do',
        orderDeadline: '2 Tage vorher',
        minimumOrderValue: '90 EUR',
        customerNumber: 'BIO-4402',
        city: 'Brandenburg',
        isActive: true,
      },
      {
        locationId,
        name: 'Fleischerei Demo',
        contactName: 'Jonas Metzger',
        phone: '+49 30 610003',
        email: 'bestellung@fleischerei-demo.test',
        deliveryDays: 'Mo bis Fr',
        orderDeadline: 'Vortag 12:00',
        minimumOrderValue: '200 EUR',
        customerNumber: 'FL-1180',
        city: 'Berlin',
        isActive: true,
      },
      {
        locationId,
        name: 'Fischhandel Demo',
        contactName: 'Tara Küste',
        phone: '+49 30 610004',
        email: 'fresh@fisch-demo.test',
        deliveryDays: 'Di, Fr',
        orderDeadline: 'Vortag 11:00',
        minimumOrderValue: '180 EUR',
        customerNumber: 'FI-2099',
        city: 'Hamburg',
        isActive: true,
      },
      {
        locationId,
        name: 'Bäckerei Demo',
        contactName: 'Oskar Kruste',
        phone: '+49 30 610005',
        email: 'office@baeckerei-demo.test',
        deliveryDays: 'täglich',
        orderDeadline: 'bis 18:00 für Folgetag',
        minimumOrderValue: '50 EUR',
        customerNumber: 'BK-7781',
        city: 'Berlin',
        isActive: true,
      },
      {
        locationId,
        name: 'Molkerei Demo',
        contactName: 'Nina Milch',
        phone: '+49 30 610006',
        email: 'order@molkerei-demo.test',
        deliveryDays: 'Mo, Mi, Fr',
        orderDeadline: 'Vortag 15:00',
        minimumOrderValue: '75 EUR',
        customerNumber: 'MO-3320',
        city: 'Potsdam',
        isActive: true,
      },
      {
        locationId,
        name: 'Reinigungsbedarf Demo',
        contactName: 'Ben Hygiene',
        phone: '+49 30 610007',
        email: 'service@reinigung-demo.test',
        deliveryDays: 'Mi',
        orderDeadline: 'Montag 16:00',
        minimumOrderValue: '60 EUR',
        customerNumber: 'RB-9912',
        city: 'Berlin',
        isActive: true,
      },
      {
        locationId,
        name: 'Verpackungen Demo',
        contactName: 'Mila Pack',
        phone: '+49 30 610008',
        email: 'sales@verpackung-demo.test',
        deliveryDays: 'Di, Do',
        orderDeadline: 'Vortag 13:00',
        minimumOrderValue: '100 EUR',
        customerNumber: 'VP-5021',
        city: 'Berlin',
        isActive: true,
      },
      {
        locationId,
        name: 'Kaffeerösterei Demo',
        contactName: 'Rafi Bohne',
        phone: '+49 30 610009',
        email: 'kaffee@roesterei-demo.test',
        deliveryDays: 'Mo, Fr',
        orderDeadline: 'Donnerstag 10:00',
        minimumOrderValue: '85 EUR',
        customerNumber: 'KR-6404',
        city: 'Berlin',
        isActive: true,
      },
      {
        locationId,
        name: 'Gewürzhandel Demo',
        contactName: 'Selin Aroma',
        phone: '+49 30 610010',
        email: 'order@gewuerz-demo.test',
        deliveryDays: 'Do',
        orderDeadline: 'Dienstag 15:00',
        minimumOrderValue: '40 EUR',
        customerNumber: 'GW-1207',
        city: 'Berlin',
        isActive: true,
      },
    ]);
  }

  private createStockItems(
    locationId: string,
    suppliers: SupplierDocument[],
  ): Promise<StockItemDocument[]> {
    const wholesale = suppliers.find(
      (supplier) => supplier.name === 'Demo Großhandel',
    );
    const freshMarket = suppliers.find(
      (supplier) => supplier.name === 'Frischemarkt Demo',
    );

    return this.stockItemModel.insertMany([
      {
        locationId,
        name: `${this.demoPrefix} Rinderhack`,
        category: 'Fleisch',
        unit: 'kg',
        quantity: 8,
        minQuantity: 5,
        targetQuantity: 15,
        supplierId: wholesale?._id.toString(),
        supplierName: wholesale?.name ?? 'Demo Großhandel',
        storageLocation: 'Kühlhaus 1',
        note: 'Für Burger-Produktion',
        isActive: true,
      },
      {
        locationId,
        name: `${this.demoPrefix} Avocado`,
        category: 'Gemüse',
        unit: 'Stk.',
        quantity: 4,
        minQuantity: 8,
        targetQuantity: 24,
        supplierId: freshMarket?._id.toString(),
        supplierName: freshMarket?.name ?? 'Frischemarkt Demo',
        storageLocation: 'Kühlhaus 2',
        note: 'Mindestbestand bewusst unterschritten',
        isActive: true,
      },
      {
        locationId,
        name: `${this.demoPrefix} Quinoa`,
        category: 'Trockenlager',
        unit: 'kg',
        quantity: 12,
        minQuantity: 4,
        targetQuantity: 18,
        supplierId: wholesale?._id.toString(),
        supplierName: wholesale?.name ?? 'Bio Demo',
        storageLocation: 'Regal A3',
        isActive: true,
      },
      {
        locationId,
        name: `${this.demoPrefix} Hauslimonade Sirup`,
        category: 'Getränke',
        unit: 'l',
        quantity: 3,
        minQuantity: 3,
        targetQuantity: 10,
        supplierId: wholesale?._id.toString(),
        supplierName: wholesale?.name ?? 'Getränke Demo',
        storageLocation: 'Barlager',
        isActive: true,
      },
    ]);
  }

  private createStockMovements(
    locationId: string,
    stockItems: StockItemDocument[],
    actor: AuthenticatedUser,
  ): Promise<StockMovementDocument[]> {
    return this.stockMovementModel.insertMany(
      stockItems.map((item, index) => ({
        locationId,
        stockItemId: item._id.toString(),
        stockItemName: item.name,
        type:
          index % 2 === 0 ? StockMovementType.Receipt : StockMovementType.Usage,
        quantityChange: index % 2 === 0 ? 5 : -2,
        quantityAfter: item.quantity,
        note: `${this.demoPrefix} Startbewegung`,
        actorId: actor.sub,
      })),
    );
  }

  private createInventoryBatches(
    stockItems: StockItemDocument[],
  ): Promise<InventoryBatchDocument[]> {
    const today = new Date();
    const expiresSoon = new Date(today);
    expiresSoon.setDate(today.getDate() + 3);
    const expiresLater = new Date(today);
    expiresLater.setDate(today.getDate() + 21);

    return this.inventoryBatchModel.insertMany(
      stockItems.map((item, index) => ({
        locationId: item.locationId,
        stockItemId: item._id.toString(),
        stockItemName: item.name,
        unit: item.unit,
        batchNumber: `DEMO-${String(index + 1).padStart(3, '0')}`,
        initialQuantity: item.quantity,
        remainingQuantity: item.quantity,
        unitPriceNet: item.purchasePriceNet ?? 0,
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        storageLocation: item.storageLocation,
        receivedAt: today,
        expiresAt:
          index === 1
            ? expiresSoon
            : index % 2 === 0
              ? expiresLater
              : undefined,
        note: `${this.demoPrefix} FIFO/MHD Startcharge`,
        isActive: true,
      })),
    );
  }

  private async createPurchaseOrders(
    locationId: string,
    stockItems: StockItemDocument[],
    suppliers: SupplierDocument[],
    actor: AuthenticatedUser,
  ): Promise<PurchaseOrderDocument[]> {
    const lowStockItems = stockItems.filter(
      (item) => item.quantity <= item.minQuantity,
    );
    if (!lowStockItems.length) {
      return [];
    }

    const bySupplier = new Map<string, StockItemDocument[]>();
    for (const item of lowStockItems) {
      const supplierId = item.supplierId ?? 'unassigned';
      bySupplier.set(supplierId, [...(bySupplier.get(supplierId) ?? []), item]);
    }

    const orders: Array<{
      locationId: string;
      supplierId: string;
      supplierName: string;
      orderNumber: string;
      status: PurchaseOrderStatus;
      lines: PurchaseOrder['lines'];
      totalNet: number;
      note: string;
      createdBy: string;
    }> = [];
    let index = 1;
    for (const [supplierId, items] of bySupplier) {
      const supplier = suppliers.find(
        (entry) => entry._id.toString() === supplierId,
      );
      const lines = items.map((item) => {
        const targetQuantity =
          item.targetQuantity ??
          Math.max(item.minQuantity * 2, item.minQuantity + 1);
        const quantity = Math.max(1, targetQuantity - item.quantity);
        const unitPriceNet = item.purchasePriceNet ?? 0;
        return {
          stockItemId: item._id.toString(),
          stockItemName: item.name,
          quantity,
          unit: item.unit,
          unitPriceNet,
          totalNet: quantity * unitPriceNet,
        };
      });

      orders.push({
        locationId,
        supplierId,
        supplierName:
          supplier?.name ?? items[0].supplierName ?? 'Ohne Lieferant',
        orderNumber: `DEMO-PO-${String(index).padStart(3, '0')}`,
        status: PurchaseOrderStatus.Draft,
        lines,
        totalNet: lines.reduce((sum, line) => sum + line.totalNet, 0),
        note: `${this.demoPrefix} Automatischer Nachbestellvorschlag`,
        createdBy: actor.sub,
      });
      index += 1;
    }

    return this.purchaseOrderModel.insertMany(orders);
  }

  private createChecklists(locationId: string): Promise<ChecklistDocument[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.checklistModel.insertMany([
      {
        locationId,
        date: today,
        title: `${this.demoPrefix} Service Start`,
        area: 'Service',
        roles: [Role.Service, Role.Filialleiter],
        tasks: [
          { title: 'Tische kontrollieren und sauber eindecken', isDone: true },
          { title: 'Reservierungen für heute prüfen', isDone: false },
          { title: 'Kassenbestand zählen', isDone: false },
        ],
        note: 'Demo-Checkliste für den Tagesstart',
      },
      {
        locationId,
        date: today,
        title: `${this.demoPrefix} Küche Mise en Place`,
        area: 'Küche',
        roles: [Role.Kueche, Role.Filialleiter],
        tasks: [
          { title: 'Kühlhaus-Temperaturen dokumentieren', isDone: true },
          { title: 'Wochenmenü vorbereiten', isDone: false },
          { title: 'Allergene für Tagesangebote prüfen', isDone: false },
        ],
      },
      {
        locationId,
        date: today,
        title: `${this.demoPrefix} Lager Kontrolle`,
        area: 'Lager',
        roles: [Role.Lager, Role.Filialleiter],
        tasks: [
          { title: 'Mindestbestände prüfen', isDone: false },
          { title: 'Wareneingang gegen Lieferschein prüfen', isDone: false },
        ],
      },
      {
        locationId,
        date: today,
        title: `${this.demoPrefix} Spülküche Tagesablauf`,
        area: 'Spülküche',
        roles: [Role.Tellerwaescher, Role.Filialleiter],
        tasks: [
          {
            title: 'Spülmaschine auf Funktion und Chemie prüfen',
            isDone: false,
          },
          {
            title: 'Sauberes Geschirr, Besteck und Gläser sortieren',
            isDone: false,
          },
          { title: 'Spülbereich reinigen und Müll trennen', isDone: false },
        ],
      },
    ]);
  }

  private roundPrice(value: number): number {
    return Number(value.toFixed(2));
  }

  private minutesAgo(minutes: number): Date {
    const date = new Date();
    date.setMinutes(date.getMinutes() - minutes);
    return date;
  }

  private hoursAgo(hours: number): Date {
    const date = new Date();
    date.setHours(date.getHours() - hours);
    return date;
  }

  private atTime(date: Date, hours: number, minutes: number): Date {
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);

    return result;
  }

  private atWeekDayTime(
    weekStart: Date,
    dayOffset: number,
    hours: number,
    minutes: number,
  ): Date {
    const result = new Date(weekStart);
    result.setDate(weekStart.getDate() + dayOffset);
    result.setHours(hours, minutes, 0, 0);

    return result;
  }

  private getMonday(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay() || 7;
    result.setDate(result.getDate() - day + 1);
    result.setHours(0, 0, 0, 0);

    return result;
  }
}
