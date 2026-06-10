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
  StaffAbsence,
  StaffAbsenceDocument,
  StaffAbsenceStatus,
  StaffAbsenceType,
} from '../staff-planning/schemas/staff-absence.schema';
import {
  StaffShift,
  StaffShiftDocument,
  StaffShiftStatus,
} from '../staff-planning/schemas/staff-shift.schema';
import {
  InternalMessage,
  InternalMessageDocument,
  InternalMessagePriority,
} from '../internal-messages/schemas/internal-message.schema';
import { City, CityDocument } from '../cities/schemas/city.schema';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import {
  MenuItem,
  MenuItemDocument,
} from '../menu-items/schemas/menu-item.schema';
import {
  CourseType,
  Order,
  OrderDocument,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  OrderTenantResolutionStatus,
  PaymentMethod,
  PaymentStatus,
  ProductionArea,
} from '../orders/schemas/order.schema';
import {
  Recipe,
  RecipeDocument,
  RecipeType,
} from '../recipes/schemas/recipe.schema';
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
import {
  COUNTER_ORDERS_MODULE_KEY,
  COST_OF_GOODS_MODULE_KEY,
  DAILY_CLOSING_MODULE_KEY,
  DEFAULT_MODULES,
  DIGITAL_MENU_MODULE_KEY,
  KDS_MODULE_KEY,
  POS_MODULE_KEY,
  REPORTING_MODULE_KEY,
  TABLE_MANAGEMENT_MODULE_KEY,
  TABLE_ORDERS_MODULE_KEY,
} from '../modules/constants/module-definitions';
import { mapOrderStatusToTableStatus } from '../orders/order-status.utils';
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
  TimeEntryStatus,
} from '../time-tracking/schemas/time-entry.schema';
import {
  PayrollPeriod,
  PayrollPeriodDocument,
  PayrollPeriodStatus,
} from '../payroll/schemas/payroll-period.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentDocument,
} from '../users/schemas/user-location-assignment.schema';
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

interface DevelopmentTenantUserConfig {
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  locationIds: string[];
  managedLocationIds: string[];
  locationAssignmentRole?: Role;
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
  private readonly legacyDemoTenantName = 'Gastromania Legacy Demo';
  private readonly legacyDemoTenantSlug = 'gastromania-legacy-demo';
  private readonly developmentPlatformAdminEmail = 'platform@gastromania.local';
  private readonly developmentPlatformAdminPassword = 'Gastromania2026!';
  private readonly tenantDemoPassword = 'Demo2026!';
  private readonly tenantDemoActiveModuleKeys = new Set([
    POS_MODULE_KEY,
    TABLE_MANAGEMENT_MODULE_KEY,
    KDS_MODULE_KEY,
    DIGITAL_MENU_MODULE_KEY,
    COST_OF_GOODS_MODULE_KEY,
    REPORTING_MODULE_KEY,
    'inventory',
    'recipes',
    'staff_management',
    'payroll',
    'time_tracking',
    'module_management',
  ]);
  private readonly frittenwerkDemoActiveModuleKeys = new Set([
    ...this.tenantDemoActiveModuleKeys,
    TABLE_ORDERS_MODULE_KEY,
    COUNTER_ORDERS_MODULE_KEY,
    DAILY_CLOSING_MODULE_KEY,
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
    @InjectModel(Recipe.name)
    private readonly recipeModel: Model<RecipeDocument>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(UserLocationAssignment.name)
    private readonly userLocationAssignmentModel: Model<UserLocationAssignmentDocument>,
    @InjectModel(DutyShift.name)
    private readonly dutyShiftModel: Model<DutyShiftDocument>,
    @InjectModel(StaffShift.name)
    private readonly staffShiftModel: Model<StaffShiftDocument>,
    @InjectModel(StaffAbsence.name)
    private readonly staffAbsenceModel: Model<StaffAbsenceDocument>,
    @InjectModel(PayrollPeriod.name)
    private readonly payrollPeriodModel: Model<PayrollPeriodDocument>,
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
    @InjectModel(City.name)
    private readonly cityModel: Model<CityDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureDevelopmentPlatformAdmin();
    await this.ensureDevelopmentDemoTenants();
    const legacyTenant = await this.ensureDevelopmentLegacyTenant();
    await this.backfillLegacyLocationTenantIds(legacyTenant);
    await this.backfillLegacyUserTenantIds(legacyTenant?.tenantId);
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
    await this.upsertDevelopmentTenantModules(
      companyId,
      this.frittenwerkDemoActiveModuleKeys,
    );
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
      companyId,
      locationId,
      tables,
    );
    const stockItems = await this.upsertSalesDemoStockItems(companyId, locationId);
    const stockMovements = await this.recreateSalesDemoStockMovements(
      companyId,
      locationId,
      stockItems,
      users[0]._id.toString(),
    );
    const timeEntries = await this.recreateSalesDemoTimeEntries(
      companyId,
      locationId,
      users,
    );
    const checklists = await this.upsertSalesDemoChecklists(companyId, locationId);
    const demoTenants = await this.ensureDevelopmentDemoTenants();
    const legacyTenant = await this.ensureDevelopmentLegacyTenant();
    await this.backfillLegacyLocationTenantIds(legacyTenant);
    await this.backfillLegacyUserTenantIds(legacyTenant?.tenantId);

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
        frittenwerkDemoTables: demoTenants.frittenwerkDemoTables,
        frittenwerkDemoMenuItems: demoTenants.frittenwerkDemoMenuItems,
        frittenwerkDemoOrders: demoTenants.frittenwerkDemoOrders,
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
        frittenwerkDemoTables: 0,
        frittenwerkDemoMenuItems: 0,
        frittenwerkDemoOrders: 0,
      };
    }

    const passwordHash = await bcrypt.hash(this.tenantDemoPassword, 12);
    let areas = 0;
    let regions = 0;
    let locations = 0;
    let users = 0;
    let modules = 0;
    let frittenwerkDemoTables = 0;
    let frittenwerkDemoMenuItems = 0;
    let frittenwerkDemoOrders = 0;

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
      await this.upsertDevelopmentTenantModules(
        tenantId,
        config.slug === 'frittenwerk-demo'
          ? this.frittenwerkDemoActiveModuleKeys
          : this.tenantDemoActiveModuleKeys,
      );
      if (config.slug === 'frittenwerk-demo') {
        await this.ensureFrittenwerkPayrollDemoData(
          tenantId,
          locationDocs,
          tenantUsers,
        );
        const orderDemo = await this.ensureFrittenwerkOrderDemoData(
          tenantId,
          companyId,
          locationDocs,
          tenantUsers,
        );
        frittenwerkDemoTables += orderDemo.tables;
        frittenwerkDemoMenuItems += orderDemo.menuItems;
        frittenwerkDemoOrders += orderDemo.orders;
      }

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
      frittenwerkDemoTables,
      frittenwerkDemoMenuItems,
      frittenwerkDemoOrders,
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

  private async ensureDevelopmentLegacyTenant(): Promise<{
    tenantId: string;
    companyId: string;
  } | null> {
    if (process.env.NODE_ENV === 'production') {
      return null;
    }

    const company = await this.companyModel
      .findOneAndUpdate(
        { slug: this.legacyDemoTenantSlug },
        {
          $set: {
            name: this.legacyDemoTenantName,
            slug: this.legacyDemoTenantSlug,
            type: 'development-legacy-demo-tenant',
            isActive: true,
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();
    const tenant = await this.tenantModel
      .findOneAndUpdate(
        { slug: this.legacyDemoTenantSlug },
        {
          $set: {
            name: this.legacyDemoTenantName,
            slug: this.legacyDemoTenantSlug,
            status: TenantStatus.Active,
            planKey: 'demo',
            licenseStatus: LicenseStatus.Active,
            billingStatus: BillingStatus.Paid,
            contactEmail: 'legacy@gastromania.local',
            billingName: this.legacyDemoTenantName,
            billingAddress: 'Legacy Demo, 50667 Köln',
            companyId: company._id.toString(),
            deletedAt: null,
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();

    await this.upsertDevelopmentTenantModules(
      tenant._id.toString(),
      this.frittenwerkDemoActiveModuleKeys,
    );

    return {
      tenantId: tenant._id.toString(),
      companyId: company._id.toString(),
    };
  }

  private async backfillLegacyLocationTenantIds(
    fallbackTenant: { tenantId: string; companyId: string } | null,
  ): Promise<number> {
    if (process.env.NODE_ENV === 'production' || !fallbackTenant) {
      return 0;
    }

    const legacyLocations = await this.locationModel
      .find({
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: '' },
        ],
      })
      .select('_id companyId')
      .exec();
    const updates = legacyLocations.map((location) => ({
      updateOne: {
        filter: { _id: location._id.toString() },
        update: {
          $set: {
            tenantId: fallbackTenant.tenantId,
            companyId: location.companyId ?? fallbackTenant.companyId,
          },
        },
      },
    }));

    if (!updates.length) {
      return 0;
    }

    const result = await this.locationModel.bulkWrite(updates);
    return result.modifiedCount ?? 0;
  }

  private async backfillLegacyUserTenantIds(
    fallbackTenantId?: string,
  ): Promise<number> {
    if (process.env.NODE_ENV === 'production') {
      return 0;
    }

    const platformRoles = [
      Role.PlatformAdminCode,
      Role.PlatformAdmin,
      Role.SuperAdmin,
    ];
    const legacyUsers = await this.userModel
      .find({
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: '' },
        ],
        roles: { $nin: platformRoles },
      })
      .select('_id companyId locationId locationIds managedLocationIds status')
      .exec();

    const updates: Array<{
      updateOne: {
        filter: { _id: string };
        update: { $set: { tenantId: string; status: string } };
      };
    }> = [];

    for (const user of legacyUsers) {
      const tenantId =
        user.companyId ??
        (await this.resolveLegacyUserTenantIdFromLocations(user)) ??
        fallbackTenantId;

      if (!tenantId) {
        continue;
      }

      updates.push({
        updateOne: {
          filter: { _id: user._id.toString() },
          update: {
            $set: {
              tenantId,
              status: user.status ?? 'active',
            },
          },
        },
      });
    }

    if (!updates.length) {
      return 0;
    }

    const result = await this.userModel.bulkWrite(updates);
    return result.modifiedCount ?? 0;
  }

  private async resolveLegacyUserTenantIdFromLocations(
    user: Pick<
      UserDocument,
      'locationId' | 'locationIds' | 'managedLocationIds'
    >,
  ): Promise<string | undefined> {
    const locationIds = Array.from(
      new Set(
        [user.locationId, ...(user.locationIds ?? []), ...(user.managedLocationIds ?? [])]
          .filter((locationId): locationId is string => Boolean(locationId)),
      ),
    );

    if (!locationIds.length) {
      return undefined;
    }

    const locations = await this.locationModel
      .find({ _id: { $in: locationIds } })
      .select('_id tenantId companyId')
      .lean()
      .exec();

    if (locations.length !== locationIds.length) {
      return undefined;
    }

    const tenantIds = Array.from(
      new Set(
        locations
          .map((location) => location.tenantId ?? location.companyId)
          .filter((tenantId): tenantId is string => Boolean(tenantId)),
      ),
    );

    return tenantIds.length === 1 ? tenantIds[0] : undefined;
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
    const demoNames = this.getDevelopmentTenantUserNames(tenant.slug);
    const configs: DevelopmentTenantUserConfig[] = [
      {
        email: `admin@${tenant.slug}.demo`,
        firstName: demoNames.admin.firstName,
        lastName: demoNames.admin.lastName,
        roles: [Role.TenantAdminCode],
        locationIds,
        managedLocationIds: locationIds,
        locationAssignmentRole: Role.LocationManager,
      },
      {
        email: `regionalleiter@${tenant.slug}.demo`,
        firstName: demoNames.regionalManager.firstName,
        lastName: demoNames.regionalManager.lastName,
        roles: [Role.Regionalleiter],
        locationIds,
        managedLocationIds: locationIds,
        locationAssignmentRole: Role.LocationManager,
      },
    ];

    for (const [locationIndex, location] of locations.entries()) {
      const citySlug = this.slugify(location.city);
      const locationId = location._id.toString();
      const locationManager =
        demoNames.locationManagers[
          locationIndex % demoNames.locationManagers.length
        ];

      configs.push(
        {
          email: `filialleiter.${citySlug}@${tenant.slug}.demo`,
          firstName: locationManager.firstName,
          lastName: locationManager.lastName,
          roles: [Role.Filialleiter],
          locationIds: [locationId],
          managedLocationIds: [locationId],
          locationAssignmentRole: Role.LocationManager,
        },
        ...[0, 1].map((offset) => {
          const person =
            demoNames.service[
              (locationIndex * 2 + offset) % demoNames.service.length
            ];
          const number = offset + 1;

          return {
            email: `service${number}.${citySlug}@${tenant.slug}.demo`,
            firstName: person.firstName,
            lastName: person.lastName,
            roles: [Role.Service],
            locationIds: [locationId],
            managedLocationIds: [],
            locationAssignmentRole: Role.Waiter,
          };
        }),
        ...[0, 1].map((offset) => {
          const person =
            demoNames.kitchen[
              (locationIndex * 2 + offset) % demoNames.kitchen.length
            ];
          const number = offset + 1;

          return {
            email: `kueche${number}.${citySlug}@${tenant.slug}.demo`,
            firstName: person.firstName,
            lastName: person.lastName,
            roles: [Role.Kueche],
            locationIds: [locationId],
            managedLocationIds: [],
            locationAssignmentRole: Role.Kitchen,
          };
        }),
      );
    }

    const primaryLocation = locations[0];
    if (primaryLocation) {
      const primaryLocationId = primaryLocation._id.toString();
      configs.push(
        {
          email: `counter.${this.slugify(primaryLocation.city)}@${tenant.slug}.demo`,
          firstName: 'Thea',
          lastName: 'Neumann',
          roles: [Role.Staff],
          locationIds: [primaryLocationId],
          managedLocationIds: [],
          locationAssignmentRole: Role.Counter,
        },
        {
          email: `cashier.${this.slugify(primaryLocation.city)}@${tenant.slug}.demo`,
          firstName: 'Karlo',
          lastName: 'Mertens',
          roles: [Role.Staff],
          locationIds: [primaryLocationId],
          managedLocationIds: [],
          locationAssignmentRole: Role.Cashier,
        },
        {
          email: `inventory.${this.slugify(primaryLocation.city)}@${tenant.slug}.demo`,
          firstName: 'Mina',
          lastName: 'Brandt',
          roles: [Role.Staff],
          locationIds: [primaryLocationId],
          managedLocationIds: [],
          locationAssignmentRole: Role.InventoryManager,
        },
        {
          email: `staff.${this.slugify(primaryLocation.city)}@${tenant.slug}.demo`,
          firstName: 'Noah',
          lastName: 'Sommer',
          roles: [Role.Staff],
          locationIds: [primaryLocationId],
          managedLocationIds: [],
          locationAssignmentRole: Role.Staff,
        },
      );
    }

    const users = await Promise.all(
      configs.map((user, index) =>
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
                employeeNumber: this.developmentEmployeeNumber(
                  tenant.slug,
                  index,
                ),
                employmentType: this.developmentEmploymentType(user.roles),
                contractType: this.developmentEmploymentType(user.roles),
                weeklyHours: this.developmentWeeklyHours(user.roles),
                hourlyRate: this.developmentHourlyRate(user.email, user.roles),
                monthlySalary: 0,
                vacationDaysPerYear: 26,
                remainingVacationDays: 18,
                employeeStatus: 'Frei',
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

    await this.upsertDevelopmentTenantUserLocationAssignments(
      tenantId,
      users,
      configs,
      locations,
    );

    return users;
  }

  private async upsertDevelopmentTenantUserLocationAssignments(
    tenantId: string,
    users: UserDocument[],
    configs: DevelopmentTenantUserConfig[],
    locations: LocationDocument[],
  ): Promise<void> {
    const configByEmail = new Map(configs.map((config) => [config.email, config]));
    const locationById = new Map(
      locations.map((location) => [location._id.toString(), location]),
    );

    await Promise.all(
      users.flatMap((user) => {
        const config = configByEmail.get(user.email);
        if (!config?.locationIds.length) {
          return [];
        }

        const primaryLocationId = config.locationIds[0];
        const assignmentRole =
          config.locationAssignmentRole ??
          this.developmentLocationAssignmentRole(config.roles);

        return config.locationIds.map((locationId) => {
          const location = locationById.get(locationId);

          return this.userLocationAssignmentModel
            .findOneAndUpdate(
              {
                tenantId,
                userId: user._id.toString(),
                locationId,
              },
              {
                $set: {
                  tenantId,
                  userId: user._id.toString(),
                  areaId: location?.areaId ?? null,
                  regionId: location?.regionId ?? null,
                  locationId,
                  role: assignmentRole,
                  isPrimary: locationId === primaryLocationId,
                },
              },
              {
                returnDocument: 'after',
                setDefaultsOnInsert: true,
                upsert: true,
              },
            )
            .exec();
        });
      }),
    );
  }

  private developmentLocationAssignmentRole(roles: Role[]): Role {
    if (roles.includes(Role.Filialleiter)) {
      return Role.LocationManager;
    }
    if (roles.includes(Role.Service)) {
      return Role.Waiter;
    }
    if (roles.includes(Role.Kueche)) {
      return Role.Kitchen;
    }
    if (roles.includes(Role.Theke) || roles.includes(Role.Bar)) {
      return Role.Counter;
    }
    if (roles.includes(Role.Kasse)) {
      return Role.Cashier;
    }
    if (roles.includes(Role.Lager)) {
      return Role.InventoryManager;
    }

    return Role.Staff;
  }

  private developmentEmployeeNumber(tenantSlug: string, index: number): string {
    return `${tenantSlug
      .replaceAll('-', '')
      .slice(0, 4)
      .toUpperCase()}-${String(index + 1).padStart(3, '0')}`;
  }

  private developmentEmploymentType(roles: Role[]): string {
    if (roles.includes(Role.TenantAdminCode) || roles.includes(Role.Regionalleiter)) {
      return 'Vollzeit';
    }
    if (roles.includes(Role.Filialleiter)) {
      return 'Vollzeit';
    }
    if (roles.includes(Role.Service)) {
      return 'Teilzeit';
    }
    return 'Minijob';
  }

  private developmentWeeklyHours(roles: Role[]): number {
    if (roles.includes(Role.TenantAdminCode) || roles.includes(Role.Regionalleiter)) {
      return 40;
    }
    if (roles.includes(Role.Filialleiter)) {
      return 38;
    }
    if (roles.includes(Role.Service)) {
      return 24;
    }
    return 16;
  }

  private developmentHourlyRate(email: string, roles: Role[]): number {
    if (
      email.includes('service2.') ||
      email.includes('kueche2.')
    ) {
      return 0;
    }

    if (roles.includes(Role.TenantAdminCode) || roles.includes(Role.Regionalleiter)) {
      return 28;
    }
    if (roles.includes(Role.Filialleiter)) {
      return 23;
    }
    if (roles.includes(Role.Service)) {
      return 14.5;
    }
    if (roles.includes(Role.Kueche)) {
      return 16.5;
    }
    return 13;
  }

  private getDevelopmentTenantUserNames(tenantSlug: string): {
    admin: { firstName: string; lastName: string };
    regionalManager: { firstName: string; lastName: string };
    locationManagers: Array<{ firstName: string; lastName: string }>;
    service: Array<{ firstName: string; lastName: string }>;
    kitchen: Array<{ firstName: string; lastName: string }>;
  } {
    const namesByTenant: Record<
      string,
      {
        admin: { firstName: string; lastName: string };
        regionalManager: { firstName: string; lastName: string };
        locationManagers: Array<{ firstName: string; lastName: string }>;
        service: Array<{ firstName: string; lastName: string }>;
        kitchen: Array<{ firstName: string; lastName: string }>;
      }
    > = {
      burgermania: {
        admin: { firstName: 'Marlene', lastName: 'Schuster' },
        regionalManager: { firstName: 'Nico', lastName: 'Berger' },
        locationManagers: [
          { firstName: 'Laura', lastName: 'Kramer' },
          { firstName: 'Emre', lastName: 'Yildiz' },
          { firstName: 'Felix', lastName: 'Hoffmann' },
        ],
        service: [
          { firstName: 'Sophie', lastName: 'Brandt' },
          { firstName: 'Jonas', lastName: 'Meier' },
          { firstName: 'Mila', lastName: 'Neumann' },
          { firstName: 'Tom', lastName: 'Klein' },
          { firstName: 'Lea', lastName: 'Sommer' },
          { firstName: 'Ben', lastName: 'Wagner' },
        ],
        kitchen: [
          { firstName: 'David', lastName: 'Koch' },
          { firstName: 'Nina', lastName: 'Vogel' },
          { firstName: 'Paul', lastName: 'Richter' },
          { firstName: 'Sara', lastName: 'Wolf' },
          { firstName: 'Elias', lastName: 'Hartmann' },
          { firstName: 'Clara', lastName: 'Weber' },
        ],
      },
      'crispy-chicken': {
        admin: { firstName: 'Katharina', lastName: 'Lorenz' },
        regionalManager: { firstName: 'Daniel', lastName: 'Krueger' },
        locationManagers: [
          { firstName: 'Aylin', lastName: 'Demir' },
          { firstName: 'Markus', lastName: 'Seidel' },
        ],
        service: [
          { firstName: 'Hannah', lastName: 'Bauer' },
          { firstName: 'Lukas', lastName: 'Fischer' },
          { firstName: 'Maja', lastName: 'Schneider' },
          { firstName: 'Noah', lastName: 'Becker' },
        ],
        kitchen: [
          { firstName: 'Omar', lastName: 'Hassan' },
          { firstName: 'Julia', lastName: 'Lehmann' },
          { firstName: 'Timo', lastName: 'Schwarz' },
          { firstName: 'Eva', lastName: 'Peters' },
        ],
      },
      'pasta-house': {
        admin: { firstName: 'Isabel', lastName: 'Graf' },
        regionalManager: { firstName: 'Marco', lastName: 'Bellini' },
        locationManagers: [
          { firstName: 'Chiara', lastName: 'Mertens' },
          { firstName: 'Sebastian', lastName: 'Lang' },
        ],
        service: [
          { firstName: 'Lena', lastName: 'Krause' },
          { firstName: 'Mats', lastName: 'Zimmer' },
          { firstName: 'Amelie', lastName: 'Scholz' },
          { firstName: 'Leon', lastName: 'Frey' },
        ],
        kitchen: [
          { firstName: 'Giulia', lastName: 'Romano' },
          { firstName: 'Fabian', lastName: 'Keller' },
          { firstName: 'Miriam', lastName: 'Jansen' },
          { firstName: 'Robert', lastName: 'Hahn' },
        ],
      },
      'grill-factory': {
        admin: { firstName: 'Stefanie', lastName: 'Busch' },
        regionalManager: { firstName: 'Patrick', lastName: 'Schmidt' },
        locationManagers: [
          { firstName: 'Svenja', lastName: 'Korte' },
          { firstName: 'Can', lastName: 'Arslan' },
        ],
        service: [
          { firstName: 'Melina', lastName: 'Voigt' },
          { firstName: 'Jan', lastName: 'Bergmann' },
          { firstName: 'Nora', lastName: 'Hein' },
          { firstName: 'Simon', lastName: 'Dietz' },
        ],
        kitchen: [
          { firstName: 'Ali', lastName: 'Kaya' },
          { firstName: 'Greta', lastName: 'Moser' },
          { firstName: 'Philipp', lastName: 'Kuhn' },
          { firstName: 'Rosa', lastName: 'Maas' },
        ],
      },
      'frittenwerk-demo': {
        admin: { firstName: 'Annika', lastName: 'Fischer' },
        regionalManager: { firstName: 'Robin', lastName: 'Neumann' },
        locationManagers: [
          { firstName: 'Mara', lastName: 'Schulte' },
        ],
        service: [
          { firstName: 'Lena', lastName: 'Hartmann' },
          { firstName: 'Jonas', lastName: 'Becker' },
        ],
        kitchen: [
          { firstName: 'Kira', lastName: 'Wagner' },
          { firstName: 'Samir', lastName: 'Yilmaz' },
        ],
      },
    };

    return (
      namesByTenant[tenantSlug] ?? {
        admin: { firstName: 'Alex', lastName: 'Meyer' },
        regionalManager: { firstName: 'Rene', lastName: 'Scholz' },
        locationManagers: [{ firstName: 'Kim', lastName: 'Bauer' }],
        service: [
          { firstName: 'Lisa', lastName: 'Weber' },
          { firstName: 'Max', lastName: 'Klein' },
        ],
        kitchen: [
          { firstName: 'Nina', lastName: 'Hoffmann' },
          { firstName: 'Tim', lastName: 'Schneider' },
        ],
      }
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

  private async ensureFrittenwerkPayrollDemoData(
    tenantId: string,
    locations: LocationDocument[],
    users: UserDocument[],
  ): Promise<void> {
    const location = locations[0];
    if (!location) {
      return;
    }

    const locationId = location._id.toString();
    const currentRange = this.monthRange(0);
    const previousRange = this.monthRange(-1);
    const payrollUsers = users
      .filter((user) =>
        [Role.Service, Role.Kueche, Role.Filialleiter].some((role) =>
          user.roles.includes(role),
        ),
      )
      .slice(0, 4);

    await Promise.all([
      this.timeEntryModel
        .deleteMany({ tenantId, note: /^Payroll-Demo-/ })
        .exec(),
      this.staffShiftModel
        .deleteMany({ tenantId, notes: /^Payroll-Demo-/ })
        .exec(),
      this.staffAbsenceModel
        .deleteMany({ tenantId, reason: /^Payroll-Demo-/ })
        .exec(),
    ]);

    const currentPlans = this.createPayrollDemoPlans(
      tenantId,
      locationId,
      payrollUsers,
      currentRange.start,
      'current',
    );
    const previousPlans = this.createPayrollDemoPlans(
      tenantId,
      locationId,
      payrollUsers,
      previousRange.start,
      'previous',
    );

    await Promise.all([
      this.staffShiftModel.insertMany([
        ...currentPlans.shifts,
        ...previousPlans.shifts,
      ]),
      this.timeEntryModel.insertMany([
        ...currentPlans.entries,
        ...previousPlans.entries,
      ]),
      this.staffAbsenceModel.insertMany([
        ...currentPlans.absences,
        ...previousPlans.absences,
      ]),
    ]);

    await this.payrollPeriodModel
      .findOneAndUpdate(
        {
          tenantId,
          locationId: null,
          employeeId: null,
          start: currentRange.start,
          end: currentRange.end,
        },
        {
          $setOnInsert: {
            tenantId,
            locationId: null,
            employeeId: null,
            start: currentRange.start,
            end: currentRange.end,
            status: PayrollPeriodStatus.Open,
            employeeSnapshots: [],
            totalsSnapshot: {},
          },
        },
        { setDefaultsOnInsert: true, upsert: true },
      )
      .exec();

    const previousSnapshot = this.createPayrollDemoSnapshot(
      users,
      previousPlans,
    );
    await this.payrollPeriodModel
      .findOneAndUpdate(
        {
          tenantId,
          locationId: null,
          employeeId: null,
          start: previousRange.start,
          end: previousRange.end,
        },
        {
          $set: {
            tenantId,
            locationId: null,
            employeeId: null,
            start: previousRange.start,
            end: previousRange.end,
            status: PayrollPeriodStatus.Locked,
            lockedAt: this.atTime(previousRange.end, 9, 15),
            lockedByUserId:
              users.find((user) => user.roles.includes(Role.TenantAdminCode))
                ?._id.toString() ?? users[0]?._id.toString(),
            employeeSnapshots: previousSnapshot.employees,
            totalsSnapshot: previousSnapshot.totals,
          },
        },
        { setDefaultsOnInsert: true, upsert: true },
      )
      .exec();
  }

  private createPayrollDemoPlans(
    tenantId: string,
    locationId: string,
    users: UserDocument[],
    monthStart: Date,
    periodKey: 'current' | 'previous',
  ): {
    entries: Array<Record<string, unknown>>;
    shifts: Array<Record<string, unknown>>;
    absences: Array<Record<string, unknown>>;
  } {
    const entries: Array<Record<string, unknown>> = [];
    const shifts: Array<Record<string, unknown>> = [];
    const absences: Array<Record<string, unknown>> = [];

    users.forEach((user, userIndex) => {
      const employeeId = user._id.toString();
      const role = user.roles.includes(Role.Kueche)
        ? Role.Kueche
        : user.roles.includes(Role.Filialleiter)
          ? Role.Filialleiter
          : Role.Service;

      for (let shiftIndex = 0; shiftIndex < 3; shiftIndex += 1) {
        const date = new Date(monthStart);
        date.setDate(3 + userIndex * 2 + shiftIndex);
        const startHour = role === Role.Kueche ? 10 : 9;
        const endHour = role === Role.Filialleiter ? 17 : startHour + 7;
        const startTime = this.atTime(date, startHour, 0);
        const endTime = this.atTime(date, endHour, 30);
        const breakMinutes = shiftIndex === 1 ? 45 : 30;
        const durationMinutes = Math.round(
          (endTime.getTime() - startTime.getTime()) / 60_000,
        );

        shifts.push({
          tenantId,
          locationId,
          roleNeeded: role,
          title: `Payroll-Demo-${periodKey}-${user.email}-${shiftIndex}`,
          startTime,
          endTime,
          status: StaffShiftStatus.Published,
          requiredStaffCount: 1,
          assignedUserIds: [employeeId],
          notes: `Payroll-Demo-${periodKey}-${user.email}`,
          createdBy: employeeId,
          publishedBy: employeeId,
          publishedAt: startTime,
        });
        entries.push({
          tenantId,
          locationId,
          employeeId,
          clockIn: startTime,
          clockOut: endTime,
          breakMinutes,
          durationMinutes,
          netDurationMinutes: durationMinutes - breakMinutes,
          status: TimeEntryStatus.Closed,
          note: `Payroll-Demo-${periodKey}-${user.email}-${shiftIndex}`,
        });
      }
    });

    const vacationUser = users[0];
    const sickUser = users[1];
    if (vacationUser) {
      const startDate = new Date(monthStart);
      startDate.setDate(20);
      absences.push({
        tenantId,
        locationId,
        userId: vacationUser._id.toString(),
        employeeId: vacationUser._id.toString(),
        type: StaffAbsenceType.Vacation,
        startDate,
        endDate: startDate,
        status: StaffAbsenceStatus.Approved,
        reason: `Payroll-Demo-${periodKey}-Urlaub`,
        approvedBy: users[0]?._id.toString(),
        approvedAt: this.atTime(startDate, 8, 0),
      });
    }
    if (sickUser) {
      const startDate = new Date(monthStart);
      startDate.setDate(22);
      absences.push({
        tenantId,
        locationId,
        userId: sickUser._id.toString(),
        employeeId: sickUser._id.toString(),
        type: StaffAbsenceType.Sick,
        startDate,
        endDate: startDate,
        status: StaffAbsenceStatus.Approved,
        reason: `Payroll-Demo-${periodKey}-Krank`,
        approvedBy: users[0]?._id.toString(),
        approvedAt: this.atTime(startDate, 8, 0),
      });
    }

    return { entries, shifts, absences };
  }

  private createPayrollDemoSnapshot(
    users: UserDocument[],
    plans: {
      entries: Array<Record<string, unknown>>;
      shifts: Array<Record<string, unknown>>;
      absences: Array<Record<string, unknown>>;
    },
  ): {
    employees: Array<Record<string, unknown>>;
    totals: Record<string, number>;
  } {
    const employees = users.map((user) => {
      const employeeId = user._id.toString();
      const employeeEntries = plans.entries.filter(
        (entry) => entry.employeeId === employeeId,
      );
      const employeeShifts = plans.shifts.filter((shift) =>
        ((shift.assignedUserIds as string[]) ?? []).includes(employeeId),
      );
      const employeeAbsences = plans.absences.filter(
        (absence) => absence.userId === employeeId,
      );
      const plannedHours = this.demoRoundHours(
        employeeShifts.reduce(
          (sum, shift) =>
            sum +
            this.demoHoursBetween(
              shift.startTime as Date,
              shift.endTime as Date,
            ),
          0,
        ),
      );
      const breakHours = this.demoRoundHours(
        employeeEntries.reduce(
          (sum, entry) => sum + Number(entry.breakMinutes ?? 0) / 60,
          0,
        ),
      );
      const actualHours = this.demoRoundHours(
        employeeEntries.reduce(
          (sum, entry) =>
            sum + Number(entry.netDurationMinutes ?? 0) / 60,
          0,
        ),
      );
      const vacationDays = employeeAbsences.filter(
        (absence) => absence.type === StaffAbsenceType.Vacation,
      ).length;
      const sickDays = employeeAbsences.filter(
        (absence) => absence.type === StaffAbsenceType.Sick,
      ).length;
      const hourlyRate = user.hourlyRate ?? 0;
      const grossPay = this.demoRoundMoney(actualHours * hourlyRate);
      const warnings = [
        !hourlyRate ? 'Stundenlohn fehlt' : '',
        !actualHours && !plannedHours && !vacationDays && !sickDays
          ? 'Keine Arbeitszeitdaten'
          : '',
      ].filter(Boolean);

      return {
        employee: {
          _id: employeeId,
          email: user.email,
          name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
          firstName: user.firstName,
          lastName: user.lastName,
          employeeNumber: user.employeeNumber,
          contractType: user.contractType,
          hourlyRate: user.hourlyRate,
          locationId: user.locationId,
          locationIds: user.locationIds,
          role: user.roles[0],
          roles: user.roles,
          isActive: user.isActive,
        },
        plannedHours,
        actualHours,
        breakHours,
        overtimeHours: this.demoRoundHours(actualHours - plannedHours),
        absenceDays: vacationDays + sickDays,
        sickDays,
        vacationDays,
        unpaidDays: 0,
        otherAbsenceDays: 0,
        hourlyRate,
        grossPay,
        laborCost: grossPay,
        minijobWarning:
          user.contractType === 'Minijob' && grossPay >= 538 * 0.9,
        warnings,
      };
    });

    return {
      employees,
      totals: {
        plannedHours: this.demoSum(employees, 'plannedHours'),
        actualHours: this.demoSum(employees, 'actualHours'),
        breakHours: this.demoSum(employees, 'breakHours'),
        overtimeHours: this.demoSum(employees, 'overtimeHours'),
        grossPay: this.demoSum(employees, 'grossPay'),
        laborCost: this.demoSum(employees, 'laborCost'),
        vacationDays: this.demoSum(employees, 'vacationDays'),
        sickDays: this.demoSum(employees, 'sickDays'),
        unpaidDays: 0,
        otherAbsenceDays: 0,
      },
    };
  }

  private monthRange(offset: number): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    return { start, end };
  }

  private demoHoursBetween(start: Date, end: Date): number {
    return Math.max(0, end.getTime() - start.getTime()) / 3_600_000;
  }

  private demoRoundHours(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private demoRoundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private demoSum(rows: Array<Record<string, unknown>>, key: string): number {
    return this.demoRoundMoney(
      rows.reduce(
        (sum, row) =>
          sum + (typeof row[key] === 'number' ? Number(row[key]) : 0),
        0,
      ),
    );
  }

  private async upsertDevelopmentTenantModules(
    tenantId: string,
    activeModuleKeys = this.tenantDemoActiveModuleKeys,
  ): Promise<void> {
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
                  activeModuleKeys.has(moduleConfig.key),
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

  private async ensureFrittenwerkOrderDemoData(
    tenantId: string,
    companyId: string,
    locations: LocationDocument[],
    users: UserDocument[],
  ): Promise<{ tables: number; menuItems: number; orders: number }> {
    const location = await this.ensureFrittenwerkOrderDemoLocation(
      tenantId,
      companyId,
      locations,
    );
    const menuItems = await this.upsertFrittenwerkDemoMenuItems();
    const tables = await this.upsertFrittenwerkDemoTables(
      tenantId,
      companyId,
      location,
    );
    const orders = await this.upsertFrittenwerkDemoOrders(
      tenantId,
      companyId,
      location,
      tables,
      menuItems,
      users,
    );
    const stockItems = await this.upsertFrittenwerkDemoStockItems(
      tenantId,
      location,
    );
    const recipes = await this.upsertFrittenwerkDemoRecipes(
      companyId,
      location,
      menuItems,
      stockItems,
    );
    await this.recreateFrittenwerkDemoOrderMovements(
      tenantId,
      location,
      orders,
      recipes,
      users[0]?._id.toString() ?? 'frittenwerk-demo-seed',
    );
    await this.syncFrittenwerkDemoTableStatuses(location._id.toString(), orders);

    return {
      tables: tables.length,
      menuItems: menuItems.length,
      orders: orders.length,
    };
  }

  private async ensureFrittenwerkOrderDemoLocation(
    tenantId: string,
    companyId: string,
    locations: LocationDocument[],
  ): Promise<LocationDocument> {
    const existing = locations[0];
    if (existing) {
      await this.ensureCityForLocation(tenantId, existing);
      return existing;
    }

    const area = await this.areaModel
      .findOneAndUpdate(
        { tenantId, name: 'NRW' },
        {
          $set: {
            tenantId,
            companyId,
            name: 'NRW',
            description: 'NRW Demo-Bereich',
            isActive: true,
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();
    const region = await this.regionModel
      .findOneAndUpdate(
        { tenantId, code: 'NRW-RHEINLAND' },
        {
          $set: {
            tenantId,
            companyId,
            areaId: area._id.toString(),
            name: 'Rheinland',
            code: 'NRW-RHEINLAND',
            description: 'Rheinland Demo-Region',
            isActive: true,
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();
    const city = await this.cityModel
      .findOneAndUpdate(
        { tenantId, regionId: region._id.toString(), name: 'Koeln' },
        {
          $set: {
            tenantId,
            areaId: area._id.toString(),
            regionId: region._id.toString(),
            name: 'Koeln',
            description: 'Koeln Demo-Stadt',
            isActive: true,
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();

    return this.locationModel
      .findOneAndUpdate(
        { tenantId, slug: 'frittenwerk-demo-koeln-innenstadt' },
        {
          $set: {
            tenantId,
            companyId,
            areaId: area._id.toString(),
            regionId: region._id.toString(),
            cityId: city._id.toString(),
            name: 'Frittenwerk Demo Koeln Innenstadt',
            slug: 'frittenwerk-demo-koeln-innenstadt',
            address: 'Hohe Strasse 1, 50667 Koeln',
            street: 'Hohe Strasse 1',
            zip: '50667',
            postalCode: '50667',
            city: 'Koeln',
            cityName: 'Koeln',
            federalState: 'Nordrhein-Westfalen',
            phone: '0221 123450',
            email: 'koeln@frittenwerk-demo.demo',
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
                width: 52,
                height: 52,
              },
              {
                id: 'theke',
                label: 'Theke',
                category: 'bar',
                icon: 'local_bar',
                floor: 'EG',
                x: 62,
                y: 12,
                width: 26,
                height: 22,
              },
            ],
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();
  }

  private async ensureCityForLocation(
    tenantId: string,
    location: LocationDocument,
  ): Promise<void> {
    if (!location.areaId || !location.regionId || !location.city) {
      return;
    }

    const city = await this.cityModel
      .findOneAndUpdate(
        {
          tenantId,
          regionId: location.regionId,
          name: location.city,
        },
        {
          $set: {
            tenantId,
            areaId: location.areaId,
            regionId: location.regionId,
            name: location.city,
            description: `${location.city} Demo-Stadt`,
            isActive: true,
          },
        },
        { returnDocument: 'after', setDefaultsOnInsert: true, upsert: true },
      )
      .exec();

    await this.locationModel
      .updateOne(
        { _id: location._id },
        {
          $set: {
            cityId: city._id.toString(),
            cityName: location.city,
          },
        },
      )
      .exec();
  }

  private async upsertFrittenwerkDemoMenuItems(): Promise<MenuItemDocument[]> {
    const configs: Array<{
      name: string;
      category: string;
      description: string;
      price: number;
      isKitchenItem: boolean;
      productionArea: ProductionArea;
      courseType: CourseType;
      color: string;
      icon: string;
      backgroundColor: string;
      textColor: string;
      sortOrder: number;
    }> = [
      {
        name: 'Classic Burger',
        category: 'Burger',
        description: 'Saftiger Burger mit Salat, Tomate und Haus-Sauce.',
        price: 9.9,
        isKitchenItem: true,
        productionArea: ProductionArea.Grill,
        courseType: CourseType.Main,
        color: '#8b5a2b',
        icon: 'burger',
        backgroundColor: '#fff3e6',
        textColor: '#4a2c16',
        sortOrder: 10,
      },
      {
        name: 'Cheese Burger',
        category: 'Burger',
        description: 'Classic Burger mit Cheddar und Gurken-Relish.',
        price: 10.9,
        isKitchenItem: true,
        productionArea: ProductionArea.Grill,
        courseType: CourseType.Main,
        color: '#8b5a2b',
        icon: 'burger',
        backgroundColor: '#fff3e6',
        textColor: '#4a2c16',
        sortOrder: 20,
      },
      {
        name: 'Veggie Burger',
        category: 'Burger',
        description: 'Vegetarischer Patty mit Krautsalat und Kraeuter-Sauce.',
        price: 10.5,
        isKitchenItem: true,
        productionArea: ProductionArea.Grill,
        courseType: CourseType.Main,
        color: '#8b5a2b',
        icon: 'burger',
        backgroundColor: '#fff3e6',
        textColor: '#4a2c16',
        sortOrder: 30,
      },
      {
        name: 'Pommes Klein',
        category: 'Beilagen',
        description: 'Kleine Portion knusprige Pommes mit Salz.',
        price: 3.5,
        isKitchenItem: true,
        productionArea: ProductionArea.Kitchen,
        courseType: CourseType.Other,
        color: '#d97706',
        icon: 'utensils',
        backgroundColor: '#fff7ed',
        textColor: '#7c2d12',
        sortOrder: 40,
      },
      {
        name: 'Pommes Gross',
        category: 'Beilagen',
        description: 'Grosse Portion Pommes mit Dip.',
        price: 4.9,
        isKitchenItem: true,
        productionArea: ProductionArea.Kitchen,
        courseType: CourseType.Other,
        color: '#d97706',
        icon: 'utensils',
        backgroundColor: '#fff7ed',
        textColor: '#7c2d12',
        sortOrder: 50,
      },
      {
        name: 'Currywurst',
        category: 'Beilagen',
        description: 'Currywurst mit hausgemachter Sauce.',
        price: 6.9,
        isKitchenItem: true,
        productionArea: ProductionArea.Kitchen,
        courseType: CourseType.Main,
        color: '#d97706',
        icon: 'utensils',
        backgroundColor: '#fff7ed',
        textColor: '#7c2d12',
        sortOrder: 60,
      },
      {
        name: 'Chicken Nuggets',
        category: 'Beilagen',
        description: 'Knusprige Nuggets mit Dip-Auswahl.',
        price: 5.9,
        isKitchenItem: true,
        productionArea: ProductionArea.Kitchen,
        courseType: CourseType.Main,
        color: '#d97706',
        icon: 'utensils',
        backgroundColor: '#fff7ed',
        textColor: '#7c2d12',
        sortOrder: 70,
      },
      {
        name: 'Cola',
        category: 'Getraenke',
        description: 'Cola 0,33 l.',
        price: 3.2,
        isKitchenItem: false,
        productionArea: ProductionArea.Counter,
        courseType: CourseType.Drink,
        color: '#2563eb',
        icon: 'glass-water',
        backgroundColor: '#eff6ff',
        textColor: '#1e3a8a',
        sortOrder: 80,
      },
      {
        name: 'Wasser',
        category: 'Getraenke',
        description: 'Mineralwasser 0,25 l.',
        price: 2.5,
        isKitchenItem: false,
        productionArea: ProductionArea.Counter,
        courseType: CourseType.Drink,
        color: '#2563eb',
        icon: 'glass-water',
        backgroundColor: '#eff6ff',
        textColor: '#1e3a8a',
        sortOrder: 90,
      },
      {
        name: 'Apfelschorle',
        category: 'Getraenke',
        description: 'Apfelschorle 0,33 l.',
        price: 3.1,
        isKitchenItem: false,
        productionArea: ProductionArea.Counter,
        courseType: CourseType.Drink,
        color: '#2563eb',
        icon: 'glass-water',
        backgroundColor: '#eff6ff',
        textColor: '#1e3a8a',
        sortOrder: 100,
      },
      {
        name: 'Kaffee',
        category: 'Kaffee',
        description: 'Frisch gebruehter Kaffee.',
        price: 2.8,
        isKitchenItem: false,
        productionArea: ProductionArea.Counter,
        courseType: CourseType.Drink,
        color: '#5b341f',
        icon: 'coffee',
        backgroundColor: '#f5eee9',
        textColor: '#2f1d13',
        sortOrder: 110,
      },
    ];

    return Promise.all(
      configs.map((config) =>
        this.menuItemModel
          .findOneAndUpdate(
            { category: config.category, name: config.name },
            {
              $set: {
                ...config,
                ingredients: config.description,
                weight: config.courseType === CourseType.Drink ? '1 Glas' : '1 Portion',
                sellingPrice: config.price,
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

  private async upsertFrittenwerkDemoStockItems(
    tenantId: string,
    location: LocationDocument,
  ): Promise<StockItemDocument[]> {
    const locationId = location._id.toString();
    const items = [
      {
        name: 'Burger Bun',
        category: 'Backwaren',
        unit: 'Stueck',
        quantity: 120,
        minQuantity: 30,
        purchasePriceNet: 0.35,
      },
      {
        name: 'Burger Patty',
        category: 'Fleisch',
        unit: 'Stueck',
        quantity: 80,
        minQuantity: 20,
        purchasePriceNet: 1.2,
      },
      {
        name: 'Veggie Patty',
        category: 'Vegetarisch',
        unit: 'Stueck',
        quantity: 45,
        minQuantity: 15,
        purchasePriceNet: 1.05,
      },
      {
        name: 'Cheddar',
        category: 'Molkerei',
        unit: 'Scheibe',
        quantity: 100,
        minQuantity: 25,
        purchasePriceNet: 0.25,
      },
      {
        name: 'Kartoffeln',
        category: 'Gemuese',
        unit: 'kg',
        quantity: 85,
        minQuantity: 30,
        purchasePriceNet: 1.1,
      },
      {
        name: 'Currywurst',
        category: 'Fleisch',
        unit: 'Stueck',
        quantity: 60,
        minQuantity: 20,
        purchasePriceNet: 1.4,
      },
      {
        name: 'Chicken Nuggets',
        category: 'Fleisch',
        unit: 'Portion',
        quantity: 70,
        minQuantity: 20,
        purchasePriceNet: 1.1,
      },
      {
        name: 'Cola Sirup',
        category: 'Getraenke',
        unit: 'Portion',
        quantity: 180,
        minQuantity: 40,
        purchasePriceNet: 0.45,
      },
      {
        name: 'Wasser Flasche',
        category: 'Getraenke',
        unit: 'Flasche',
        quantity: 140,
        minQuantity: 40,
        purchasePriceNet: 0.35,
      },
      {
        name: 'Apfelschorle Flasche',
        category: 'Getraenke',
        unit: 'Flasche',
        quantity: 90,
        minQuantity: 30,
        purchasePriceNet: 0.5,
      },
      {
        name: 'Kaffeebohnen',
        category: 'Kaffee',
        unit: 'Portion',
        quantity: 120,
        minQuantity: 25,
        purchasePriceNet: 0.28,
      },
    ];

    return Promise.all(
      items.map((item) =>
        this.stockItemModel
          .findOneAndUpdate(
            { locationId, name: item.name },
            {
              $set: {
                tenantId,
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
                storageLocation: 'Frittenwerk Demo Lager',
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

  private async upsertFrittenwerkDemoRecipes(
    companyId: string,
    location: LocationDocument,
    menuItems: MenuItemDocument[],
    stockItems: StockItemDocument[],
  ): Promise<RecipeDocument[]> {
    const locationId = location._id.toString();
    const stockByName = new Map(stockItems.map((item) => [item.name, item]));
    const recipeConfigs: Record<
      string,
      Array<{ stockItemName: string; quantity: number }>
    > = {
      'Classic Burger': [
        { stockItemName: 'Burger Bun', quantity: 1 },
        { stockItemName: 'Burger Patty', quantity: 1 },
      ],
      'Cheese Burger': [
        { stockItemName: 'Burger Bun', quantity: 1 },
        { stockItemName: 'Burger Patty', quantity: 1 },
        { stockItemName: 'Cheddar', quantity: 1 },
      ],
      'Veggie Burger': [
        { stockItemName: 'Burger Bun', quantity: 1 },
        { stockItemName: 'Veggie Patty', quantity: 1 },
      ],
      'Pommes Klein': [{ stockItemName: 'Kartoffeln', quantity: 0.25 }],
      'Pommes Gross': [{ stockItemName: 'Kartoffeln', quantity: 0.4 }],
      Currywurst: [{ stockItemName: 'Currywurst', quantity: 1 }],
      'Chicken Nuggets': [{ stockItemName: 'Chicken Nuggets', quantity: 1 }],
      Cola: [{ stockItemName: 'Cola Sirup', quantity: 1 }],
      Wasser: [{ stockItemName: 'Wasser Flasche', quantity: 1 }],
      Apfelschorle: [{ stockItemName: 'Apfelschorle Flasche', quantity: 1 }],
      Kaffee: [{ stockItemName: 'Kaffeebohnen', quantity: 1 }],
    };

    return Promise.all(
      menuItems.map((menuItem) => {
        const typedMenuItem = menuItem as MenuItemDocument & {
          courseType?: CourseType;
          productionArea?: ProductionArea;
        };
        const courseType =
          typedMenuItem.courseType ??
          (menuItem.category === 'Getraenke' || menuItem.category === 'Kaffee'
            ? CourseType.Drink
            : CourseType.Main);
        const productionArea =
          typedMenuItem.productionArea ??
          (courseType === CourseType.Drink
            ? ProductionArea.Counter
            : menuItem.name.includes('Burger')
              ? ProductionArea.Grill
              : ProductionArea.Kitchen);
        const ingredients = (recipeConfigs[menuItem.name] ?? [])
          .map((ingredient) => {
            const stockItem = stockByName.get(ingredient.stockItemName);

            if (!stockItem) {
              return undefined;
            }

            return {
              stockItemId: stockItem._id.toString(),
              stockItemName: stockItem.name,
              quantity: ingredient.quantity,
              unit: stockItem.unit,
              wasteFactor: 1,
              isOptional: false,
              purchasePriceNet: stockItem.purchasePriceNet,
              allergens: [],
              additives: [],
              nutrition: {},
            };
          })
          .filter(
            (ingredient): ingredient is NonNullable<typeof ingredient> =>
              Boolean(ingredient),
          );
        const recipeNumber = `FW-DEMO-${menuItem.name
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '-')}`;

        return this.recipeModel
          .findOneAndUpdate(
            { recipeNumber },
            {
              $set: {
                companyId,
                locationId,
                recipeNumber,
                menuItemId: menuItem._id.toString(),
                name: menuItem.name,
                description: `Frittenwerk Demo Rezept fuer ${menuItem.name}`,
                category: menuItem.category,
                type: courseType === CourseType.Drink ? RecipeType.Drink : RecipeType.Food,
                salePrice: menuItem.sellingPrice ?? menuItem.price,
                vatRate: 19,
                isActive: true,
                visibleInSales: true,
                productionArea,
                preparationTimeMinutes: courseType === CourseType.Drink ? 1 : 8,
                portionSize: '1 Portion',
                basePortions: 1,
                isArchived: false,
                ingredients,
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

  private async recreateFrittenwerkDemoOrderMovements(
    tenantId: string,
    location: LocationDocument,
    orders: OrderDocument[],
    recipes: RecipeDocument[],
    actorId: string,
  ): Promise<number> {
    const locationId = location._id.toString();
    const recipeByMenuItemId = new Map(
      recipes.map((recipe) => [recipe.menuItemId, recipe]),
    );
    const stockItems = await this.stockItemModel
      .find({ tenantId, locationId })
      .exec();
    const stockById = new Map(
      stockItems.map((stockItem) => [stockItem._id.toString(), stockItem]),
    );
    const quantities = new Map(
      stockItems.map((stockItem) => [
        stockItem._id.toString(),
        Number(stockItem.quantity ?? 0),
      ]),
    );

    await this.stockMovementModel
      .deleteMany({ tenantId, locationId, note: /^Frittenwerk-Demo-COGS-/ })
      .exec();

    const movementPayloads: Array<Record<string, unknown>> = [];
    const movementOrderIds = new Map<string, string[]>();

    for (const order of orders) {
      const timestampedOrder = order as OrderDocument & {
        createdAt?: Date;
        updatedAt?: Date;
      };
      if (
        ![
          OrderStatus.Accepted,
          OrderStatus.Preparing,
          OrderStatus.Ready,
          OrderStatus.Served,
          OrderStatus.Closed,
        ].includes(order.status)
      ) {
        continue;
      }

      for (const orderItem of order.items ?? []) {
        const recipe = recipeByMenuItemId.get(
          orderItem.menuItemId ?? orderItem.productId,
        );

        if (!recipe) {
          continue;
        }

        for (const ingredient of recipe.ingredients ?? []) {
          const stockItem = stockById.get(ingredient.stockItemId);

          if (!stockItem) {
            continue;
          }

          const requiredQuantity = this.roundQuantity(
            ingredient.quantity * orderItem.quantity * (ingredient.wasteFactor ?? 1),
          );
          const before = quantities.get(stockItem._id.toString()) ?? 0;
          const after = this.roundQuantity(before - requiredQuantity);
          const valueNet = this.roundPrice(
            requiredQuantity *
              Number(stockItem.averageCost ?? stockItem.purchasePriceNet ?? 0),
          );

          quantities.set(stockItem._id.toString(), after);
          movementPayloads.push({
            tenantId,
            locationId,
            stockItemId: stockItem._id.toString(),
            orderId: order._id.toString(),
            orderItemId: orderItem._id?.toString(),
            recipeId: recipe._id.toString(),
            menuItemId: orderItem.menuItemId ?? orderItem.productId,
            referenceType: 'order',
            referenceId: order._id.toString(),
            stockItemName: stockItem.name,
            type: StockMovementType.OrderConsumption,
            quantityChange: -requiredQuantity,
            quantity: requiredQuantity,
            unit: stockItem.unit,
            quantityBefore: before,
            quantityAfter: after,
            unitPriceNet: Number(
              stockItem.averageCost ?? stockItem.purchasePriceNet ?? 0,
            ),
            valueNet,
            note: `Frittenwerk-Demo-COGS-${order.orderNumber}`,
            reason: StockMovementType.OrderConsumption,
            actorId,
            createdAt: timestampedOrder.createdAt,
            updatedAt: timestampedOrder.updatedAt,
          });
        }
      }
    }

    const movements = movementPayloads.length
      ? ((await this.stockMovementModel.insertMany(movementPayloads)) as unknown as Array<
          StockMovementDocument & { _id: unknown }
        >)
      : [];

    movements.forEach((movement, index) => {
      const orderId = String(movementPayloads[index]?.orderId ?? '');
      const ids = movementOrderIds.get(orderId) ?? [];
      ids.push(String(movement._id));
      movementOrderIds.set(orderId, ids);
    });

    const orderTimestamps = new Map<string, Date>();
    for (const order of orders) {
      const timestampedOrder = order as OrderDocument & { updatedAt?: Date };
      orderTimestamps.set(order._id.toString(), timestampedOrder.updatedAt ?? new Date());
    }

    await Promise.all([
      ...Array.from(quantities.entries()).map(([stockItemId, quantity]) =>
        this.stockItemModel
          .updateOne({ _id: stockItemId }, { $set: { quantity } })
          .exec(),
      ),
      ...orders.map((order) => {
        const movementIds = movementOrderIds.get(order._id.toString()) ?? [];
        const updatedAt = orderTimestamps.get(order._id.toString()) ?? new Date();

        return this.orderModel
          .updateOne(
            { _id: order._id },
            {
              $set: {
                inventoryDeducted: movementIds.length > 0,
                inventoryDeductedAt: movementIds.length ? updatedAt : undefined,
                inventoryConsumedAt: movementIds.length ? updatedAt : undefined,
                inventoryMovementIds: movementIds,
                inventoryWarnings: [],
              },
            },
          )
          .exec();
      }),
    ]);

    return movements.length;
  }

  private async upsertFrittenwerkDemoTables(
    tenantId: string,
    companyId: string,
    location: LocationDocument,
  ): Promise<RestaurantTableDocument[]> {
    const locationId = location._id.toString();

    return Promise.all(
      Array.from({ length: 5 }, (_, index) => {
        const tableNumber = index + 1;

        return this.tableModel
          .findOneAndUpdate(
            { locationId, name: `Tisch ${tableNumber}` },
            {
              $set: {
                tenantId,
                companyId,
                areaId: location.areaId,
                regionId: location.regionId,
                tableNumber: String(tableNumber),
                tableName: `Tisch ${tableNumber}`,
                name: `Tisch ${tableNumber}`,
                locationId,
                seats: tableNumber === 5 ? 6 : 4,
                area: 'Restaurantbereich',
                icon: 'table_restaurant',
                status: TableStatus.Free,
                isActive: true,
                qrEnabled: true,
                planX: 10 + index * 14,
                planY: 18 + (index % 2) * 16,
                planWidth: 12,
                planHeight: 10,
                planRotation: 0,
                floorId: `${locationId}:eg`,
                floorName: 'EG',
                planFloor: 'EG',
                planShape:
                  tableNumber % 2 === 0 ? TableShape.Round : TableShape.Rectangle,
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

  private async upsertFrittenwerkDemoOrders(
    tenantId: string,
    companyId: string,
    location: LocationDocument,
    tables: RestaurantTableDocument[],
    menuItems: MenuItemDocument[],
    users: UserDocument[],
  ): Promise<OrderDocument[]> {
    const locationId = location._id.toString();
    const itemByName = new Map(menuItems.map((item) => [item.name, item]));
    const tableByName = new Map(tables.map((table) => [table.name, table]));
    const serviceUser =
      users.find((user) => user.roles.includes(Role.Service)) ?? users[0];
    const counterUser =
      users.find((user) => user.roles.includes(Role.Theke)) ?? serviceUser;
    const configs: Array<{
      orderNumber: string;
      source: OrderSource;
      status: OrderStatus;
      paymentStatus: PaymentStatus;
      paymentMethod?: PaymentMethod;
      tableName?: string;
      pickupNumber?: string;
      customerName?: string;
      minutesAgo: number;
      employee?: UserDocument;
      items: Array<{ name: string; quantity: number; status: OrderItemStatus }>;
    }> = [
      {
        orderNumber: 'FRITTENWERK-DEMO-T001',
        source: OrderSource.Internal,
        status: OrderStatus.New,
        paymentStatus: PaymentStatus.Open,
        tableName: 'Tisch 1',
        minutesAgo: 14,
        employee: serviceUser,
        items: [
          { name: 'Classic Burger', quantity: 2, status: OrderItemStatus.Open },
          { name: 'Pommes Klein', quantity: 2, status: OrderItemStatus.Open },
          { name: 'Cola', quantity: 2, status: OrderItemStatus.Open },
        ],
      },
      {
        orderNumber: 'FRITTENWERK-DEMO-T002',
        source: OrderSource.Internal,
        status: OrderStatus.Preparing,
        paymentStatus: PaymentStatus.Open,
        tableName: 'Tisch 2',
        minutesAgo: 32,
        employee: serviceUser,
        items: [
          { name: 'Cheese Burger', quantity: 1, status: OrderItemStatus.Started },
          { name: 'Pommes Gross', quantity: 1, status: OrderItemStatus.Preparing },
          { name: 'Apfelschorle', quantity: 1, status: OrderItemStatus.Open },
        ],
      },
      {
        orderNumber: 'FRITTENWERK-DEMO-T003',
        source: OrderSource.Internal,
        status: OrderStatus.Ready,
        paymentStatus: PaymentStatus.Open,
        tableName: 'Tisch 3',
        minutesAgo: 41,
        employee: serviceUser,
        items: [
          { name: 'Veggie Burger', quantity: 1, status: OrderItemStatus.Ready },
          { name: 'Chicken Nuggets', quantity: 1, status: OrderItemStatus.Ready },
          { name: 'Wasser', quantity: 2, status: OrderItemStatus.Ready },
        ],
      },
      {
        orderNumber: 'FRITTENWERK-DEMO-T004',
        source: OrderSource.Internal,
        status: OrderStatus.Closed,
        paymentStatus: PaymentStatus.Paid,
        paymentMethod: PaymentMethod.Card,
        tableName: 'Tisch 4',
        minutesAgo: 74,
        employee: serviceUser,
        items: [
          { name: 'Currywurst', quantity: 2, status: OrderItemStatus.Served },
          { name: 'Pommes Klein', quantity: 2, status: OrderItemStatus.Served },
          { name: 'Cola', quantity: 2, status: OrderItemStatus.Served },
        ],
      },
      {
        orderNumber: 'FRITTENWERK-DEMO-C101',
        pickupNumber: '101',
        source: OrderSource.Counter,
        status: OrderStatus.New,
        paymentStatus: PaymentStatus.Open,
        customerName: 'Abholung 101',
        minutesAgo: 9,
        employee: counterUser,
        items: [
          { name: 'Cheese Burger', quantity: 1, status: OrderItemStatus.Open },
          { name: 'Cola', quantity: 1, status: OrderItemStatus.Open },
        ],
      },
      {
        orderNumber: 'FRITTENWERK-DEMO-C102',
        pickupNumber: '102',
        source: OrderSource.Counter,
        status: OrderStatus.Preparing,
        paymentStatus: PaymentStatus.Open,
        customerName: 'Abholung 102',
        minutesAgo: 22,
        employee: counterUser,
        items: [
          { name: 'Currywurst', quantity: 1, status: OrderItemStatus.Preparing },
          { name: 'Pommes Gross', quantity: 1, status: OrderItemStatus.Started },
        ],
      },
      {
        orderNumber: 'FRITTENWERK-DEMO-C103',
        pickupNumber: '103',
        source: OrderSource.Counter,
        status: OrderStatus.Ready,
        paymentStatus: PaymentStatus.Open,
        customerName: 'Abholung 103',
        minutesAgo: 28,
        employee: counterUser,
        items: [
          { name: 'Kaffee', quantity: 1, status: OrderItemStatus.Ready },
          { name: 'Wasser', quantity: 1, status: OrderItemStatus.Ready },
        ],
      },
      {
        orderNumber: 'FRITTENWERK-DEMO-QR201',
        source: OrderSource.Qr,
        status: OrderStatus.Accepted,
        paymentStatus: PaymentStatus.Open,
        tableName: 'Tisch 5',
        minutesAgo: 16,
        employee: serviceUser,
        items: [
          { name: 'Chicken Nuggets', quantity: 2, status: OrderItemStatus.Open },
          { name: 'Pommes Klein', quantity: 1, status: OrderItemStatus.Open },
        ],
      },
      {
        orderNumber: 'FRITTENWERK-DEMO-CANCEL',
        pickupNumber: '199',
        source: OrderSource.Counter,
        status: OrderStatus.Cancelled,
        paymentStatus: PaymentStatus.Cancelled,
        customerName: 'Storno Demo',
        minutesAgo: 65,
        employee: counterUser,
        items: [
          { name: 'Veggie Burger', quantity: 1, status: OrderItemStatus.Cancelled },
        ],
      },
    ];

    return Promise.all(
      configs.map((config) => {
        const table = config.tableName
          ? tableByName.get(config.tableName)
          : undefined;
        const order = this.frittenwerkDemoOrder({
          tenantId,
          companyId,
          locationId,
          table,
          itemByName,
          ...config,
        });

        return this.orderModel
          .findOneAndUpdate(
            { tenantId, locationId, orderNumber: config.orderNumber },
            {
              $set: order,
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

  private frittenwerkDemoOrder(config: {
    tenantId: string;
    companyId: string;
    locationId: string;
    orderNumber: string;
    source: OrderSource;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod?: PaymentMethod;
    table?: RestaurantTableDocument;
    pickupNumber?: string;
    customerName?: string;
    minutesAgo: number;
    employee?: UserDocument;
    itemByName: Map<string, MenuItemDocument>;
    items: Array<{ name: string; quantity: number; status: OrderItemStatus }>;
  }): Record<string, unknown> {
    const createdAt = this.minutesAgo(config.minutesAgo);
    const changedAt = this.minutesAgo(Math.max(config.minutesAgo - 4, 1));
    const items = config.items.flatMap((item) => {
      const menuItem = config.itemByName.get(item.name);

      if (!menuItem) {
        return [];
      }

      const price = menuItem.sellingPrice ?? menuItem.price;
      const totalPrice = this.roundPrice(price * item.quantity);
      const productionArea =
        item.name === 'Cola' ||
        item.name === 'Wasser' ||
        item.name === 'Apfelschorle' ||
        item.name === 'Kaffee'
          ? ProductionArea.Counter
          : item.name.includes('Burger')
            ? ProductionArea.Grill
            : ProductionArea.Kitchen;

      return [
        {
          menuItemId: menuItem._id.toString(),
          productId: menuItem._id.toString(),
          name: menuItem.name,
          quantity: item.quantity,
          price,
          totalPrice,
          note: item.name === 'Cheese Burger' ? 'Extra Sauce' : undefined,
          isKitchenItem: menuItem.isKitchenItem,
          status: item.status,
          productionArea,
          courseType:
            productionArea === ProductionArea.Counter
              ? CourseType.Drink
              : CourseType.Main,
          changedAt,
          startedAt:
            item.status === OrderItemStatus.Started ? changedAt : undefined,
          inPreparationAt:
            item.status === OrderItemStatus.Preparing ? changedAt : undefined,
          readyAt: item.status === OrderItemStatus.Ready ? changedAt : undefined,
          servedAt:
            item.status === OrderItemStatus.Served ? changedAt : undefined,
          cancelledAt:
            item.status === OrderItemStatus.Cancelled ? changedAt : undefined,
        },
      ];
    });
    const subtotal = this.roundPrice(
      items.reduce((sum, item) => sum + Number(item.totalPrice ?? 0), 0),
    );
    const paymentMethod = config.paymentMethod ?? PaymentMethod.Other;
    const isPaid = config.paymentStatus === PaymentStatus.Paid;
    const isCancelled = config.status === OrderStatus.Cancelled;

    return {
      tenantId: config.tenantId,
      tenantResolutionStatus: OrderTenantResolutionStatus.Resolved,
      tenantResolvedAt: createdAt,
      companyId: config.companyId,
      locationId: config.locationId,
      orderNumber: config.orderNumber,
      source: config.source,
      tableId: config.table?._id.toString(),
      pickupNumber: config.pickupNumber,
      customerName: config.customerName,
      guestCount: config.table?.seats ?? 1,
      status: config.status,
      paymentStatus: config.paymentStatus,
      paymentMethod,
      items,
      subtotal,
      tax: this.roundPrice(subtotal * 0.19),
      total: subtotal,
      discountTotal: 0,
      refundTotal: isCancelled ? subtotal : 0,
      tipTotal: 0,
      cashAmount: isPaid && paymentMethod === PaymentMethod.Cash ? subtotal : 0,
      cardAmount: isPaid && paymentMethod === PaymentMethod.Card ? subtotal : 0,
      onlineAmount:
        isPaid && paymentMethod === PaymentMethod.Online ? subtotal : 0,
      voucherAmount: 0,
      otherAmount:
        isPaid && paymentMethod === PaymentMethod.Other ? subtotal : 0,
      employeeId: config.employee?._id.toString(),
      employeeName: config.employee
        ? `${config.employee.firstName ?? ''} ${config.employee.lastName ?? ''}`.trim()
        : 'Frittenwerk Demo',
      createdBy: config.employee?._id.toString(),
      assignedWaiterId: config.employee?._id.toString(),
      statusTimestamps: {
        [OrderStatus.New]: createdAt,
        [config.status]: changedAt,
      },
      completedAt:
        config.status === OrderStatus.Closed ? this.minutesAgo(20) : undefined,
      cancelledAt: isCancelled ? changedAt : undefined,
      paidAt: isPaid ? this.minutesAgo(18) : undefined,
      paidBy: isPaid ? config.employee?._id.toString() : undefined,
      cancelReason: isCancelled ? 'Gast hat Bestellung storniert' : undefined,
      inventoryDeducted: false,
      inventoryMovementIds: [],
      inventoryWarnings: [],
      notes: 'Frittenwerk Demo-Order',
      createdAt,
      updatedAt: changedAt,
    };
  }

  private async syncFrittenwerkDemoTableStatuses(
    locationId: string,
    orders: OrderDocument[],
  ): Promise<void> {
    const tableNames = ['Tisch 1', 'Tisch 2', 'Tisch 3', 'Tisch 4', 'Tisch 5'];

    await this.tableModel
      .updateMany(
        { locationId, name: { $in: tableNames } },
        {
          $set: {
            status: TableStatus.Free,
            activeOrderIds: [],
            currentTotal: 0,
            guestCount: 0,
          },
          $unset: {
            waitingSince: '',
            lastStatusChange: '',
            assignedWaiterId: '',
          },
        },
      )
      .exec();

    await Promise.all(
      orders
        .filter((order) => Boolean(order.tableId))
        .map((order) => {
          const isActive = ![
            OrderStatus.Cancelled,
            OrderStatus.Closed,
          ].includes(order.status);
          const tableStatus = mapOrderStatusToTableStatus(
            order.status,
            order.paymentStatus,
          );

          return this.tableModel
            .updateOne(
              { _id: order.tableId },
              {
                $set: {
                  status: tableStatus,
                  activeOrderIds: isActive ? [order._id.toString()] : [],
                  currentTotal: order.total ?? 0,
                  guestCount: order.guestCount ?? 0,
                  waitingSince: isActive
                    ? ((order as OrderDocument & { createdAt?: Date }).createdAt ??
                      this.minutesAgo(1))
                    : undefined,
                  lastStatusChange: new Date(),
                  assignedWaiterId: order.assignedWaiterId,
                },
              },
            )
            .exec();
        }),
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
            tenantId: companyId,
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
                tenantId: companyId,
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
      tenantId: config.companyId,
      tenantResolutionStatus: OrderTenantResolutionStatus.Resolved,
      tenantResolvedAt: createdAt,
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
    tenantId: string,
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
        tenantId,
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
        tenantId,
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
        tenantId,
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
    tenantId: string;
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
      tenantId: config.tenantId,
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
    tenantId: string,
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
                tenantId,
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
    tenantId: string,
    locationId: string,
    stockItems: StockItemDocument[],
    actorId: string,
  ): Promise<StockMovementDocument[]> {
    await this.stockMovementModel
      .deleteMany({ locationId, note: /^Sales-Demo-/ })
      .exec();

    return this.stockMovementModel.insertMany(
      stockItems.map((item, index) => ({
        tenantId,
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
    tenantId: string,
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
          tenantId,
          locationId,
          employeeId: user._id.toString(),
          clockIn: this.hoursAgo(index === 0 ? 3 : 2),
          breakMinutes: index === 2 ? 30 : 15,
          note: `Sales-Demo-${user.email}`,
        })),
    );
  }

  private upsertSalesDemoChecklists(
    tenantId: string,
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
            { tenantId, locationId, date: today, title: checklist.title },
            {
              $set: {
                tenantId,
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
                status: 'active',
                tenantId: companyId,
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

    const legacyOrders = [
      ...baseOrders,
      ...this.createGeneratedOrders(locationId, tables, 50),
    ].map((order) => ({
      ...order,
      tenantResolutionStatus: OrderTenantResolutionStatus.LegacyOrphan,
      tenantResolutionReason: 'Legacy-Demo-Order ohne Tenant-Kontext',
      tenantResolvedAt: new Date(),
    }));

    return this.orderModel.insertMany(legacyOrders);
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

  private roundQuantity(value: number): number {
    return Number(value.toFixed(3));
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
