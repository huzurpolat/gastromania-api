import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Checklist,
  ChecklistDocument,
} from '../checklists/schemas/checklist.schema';
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
import { MenuItem, MenuItemDocument } from '../menu-items/schemas/menu-item.schema';
import { Order, OrderDocument, OrderStatus } from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationDocument,
  ReservationStatus,
} from '../reservations/schemas/reservation.schema';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableShape,
  TableStatus,
} from '../tables/schemas/table.schema';
import { StockItem, StockItemDocument } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementDocument,
  StockMovementType,
} from '../stock/schemas/stock-movement.schema';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
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
    role: Role;
  }>;
}

@Injectable()
export class DemoDataService {
  private readonly demoPrefix = '[Demo]';
  private readonly demoPassword = 'Demo123!';

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
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(Checklist.name)
    private readonly checklistModel: Model<ChecklistDocument>,
  ) {}

  async seed(actor: AuthenticatedUser): Promise<DemoDataResult> {
    await this.clearExistingDemoData();

    const location = await this.locationModel.create({
      name: `${this.demoPrefix} Testfiliale Innenstadt`,
      street: 'Demoallee 12',
      zip: '10115',
      city: 'Berlin',
      phone: '+49 30 123456',
      email: 'demo-filiale@gastromania.local',
      isActive: true,
      managerId: actor.sub,
    });
    const locationId = location._id.toString();
    const users = await this.createUsers(locationId);
    const manager = users.find((user) => user.roles.includes(Role.Filialleiter));
    if (manager) {
      location.managerId = manager._id.toString();
      await location.save();
    }
    const tables = await this.createTables(locationId);
    const menuItems = await this.createMenuItems();
    const orders = await this.createOrders(locationId, tables);
    const reservations = await this.createReservations(locationId, tables);
    const dutyShifts = await this.createDutyShifts(locationId, users);
    const timeEntries = await this.createTimeEntries(locationId, users);
    const weeklyMenus = await this.createWeeklyMenu(locationId, menuItems);
    const internalMessages = await this.createInternalMessages(locationId, actor);
    const suppliers = await this.createSuppliers(locationId);
    const stockItems = await this.createStockItems(locationId, suppliers);
    const stockMovements = await this.createStockMovements(locationId, stockItems, actor);
    const checklists = await this.createChecklists(locationId);

    return {
      locationId,
      created: {
        locations: 1,
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

  private async clearExistingDemoData(): Promise<void> {
    const demoLocations = await this.locationModel
      .find({ name: new RegExp(`^\\${this.demoPrefix}`) })
      .select('_id')
      .exec();
    const locationIds = demoLocations.map((location) => location._id.toString());

    await Promise.all([
      this.orderModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.reservationModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.tableModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.dutyShiftModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.timeEntryModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.weeklyMenuModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.internalMessageModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.stockItemModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.stockMovementModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.supplierModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.checklistModel.deleteMany({ locationId: { $in: locationIds } }).exec(),
      this.locationModel.deleteMany({ _id: { $in: locationIds } }).exec(),
      this.menuItemModel
        .deleteMany({ name: new RegExp(`^\\${this.demoPrefix}`) })
        .exec(),
      this.userModel
        .deleteMany({ email: /@demo\.gastromania\.local$/ })
        .exec(),
    ]);
  }

  private async createUsers(locationId: string): Promise<UserDocument[]> {
    const passwordHash = await bcrypt.hash(this.demoPassword, 12);
    const users = [
      {
        email: 'admin@demo.gastromania.local',
        firstName: 'Ada',
        lastName: 'Admin',
        roles: [Role.Admin],
      },
      {
        email: 'filialleiter@demo.gastromania.local',
        firstName: 'Mira',
        lastName: 'Leitung',
        roles: [Role.Filialleiter],
      },
      {
        email: 'service@demo.gastromania.local',
        firstName: 'Sami',
        lastName: 'Service',
        roles: [Role.Service],
      },
      {
        email: 'kueche@demo.gastromania.local',
        firstName: 'Klara',
        lastName: 'Küche',
        roles: [Role.Kueche],
      },
      {
        email: 'lager@demo.gastromania.local',
        firstName: 'Leo',
        lastName: 'Lager',
        roles: [Role.Lager],
      },
      {
        email: 'tellerwaescher@demo.gastromania.local',
        firstName: 'Theo',
        lastName: 'Spülküche',
        roles: [Role.Tellerwaescher],
      },
    ].map((user) => ({
      ...user,
      passwordHash,
      isActive: true,
      locationId,
      locationIds: [locationId],
    }));

    return this.userModel.insertMany(users);
  }

  private createTables(locationId: string): Promise<RestaurantTableDocument[]> {
    return this.tableModel.insertMany([
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
    ]);
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
        tableId: tables[0]._id.toString(),
        status: OrderStatus.InProgress,
        items: [
          { name: `${this.demoPrefix} Rinderburger`, quantity: 2, price: 15.5, isKitchenItem: true },
          { name: `${this.demoPrefix} Hauslimonade`, quantity: 2, price: 4.5, isKitchenItem: false },
        ],
        total: 40,
        notes: 'Demo-Bestellung für Küchenboard',
      },
      {
        locationId,
        tableId: tables[4]._id.toString(),
        status: OrderStatus.Ready,
        items: [
          { name: `${this.demoPrefix} Kürbissuppe`, quantity: 1, price: 7.2, isKitchenItem: true },
          { name: `${this.demoPrefix} Tiramisu`, quantity: 1, price: 6.8, isKitchenItem: false },
        ],
        total: 14,
        notes: 'Kann serviert werden',
      },
      {
        locationId,
        tableId: tables[1]._id.toString(),
        status: OrderStatus.Open,
        items: [
          { name: `${this.demoPrefix} Avocado Bowl`, quantity: 3, price: 12.9, isKitchenItem: true },
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
      { name: `${this.demoPrefix} Avocado Bowl`, price: 12.9, isKitchenItem: true },
      { name: `${this.demoPrefix} Rinderburger`, price: 15.5, isKitchenItem: true },
      { name: `${this.demoPrefix} Kürbissuppe`, price: 7.2, isKitchenItem: true },
      { name: `${this.demoPrefix} Tiramisu`, price: 6.8, isKitchenItem: false },
      { name: `${this.demoPrefix} Hauslimonade`, price: 4.5, isKitchenItem: false },
    ];
    const statuses = [
      OrderStatus.Open,
      OrderStatus.InProgress,
      OrderStatus.Ready,
      OrderStatus.Completed,
      OrderStatus.Completed,
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
    const today = new Date();

    return this.dutyShiftModel.insertMany(
      users.map((user, index) => ({
        locationId,
        employeeId: user._id.toString(),
        role: user.roles[0],
        startTime: this.atTime(today, 9 + index, 0),
        endTime: this.atTime(today, 17 + index, 0),
        note: `${this.demoPrefix} Testschicht`,
      })),
    );
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
    const days = Array.from({ length: 5 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      const item = menuItems[index % menuItems.length];

      return {
        date,
        menuType: (index % 2 === 0 ? 'Tagesmenü' : 'Mittagsmenü') as
          | 'Tagesmenü'
          | 'Mittagsmenü',
        title: `${this.demoPrefix} ${item.name.replace(`${this.demoPrefix} `, '')}`,
        description: 'Automatisch erzeugtes Demo-Angebot',
        menuItemIds: [item._id.toString()],
        menuItems: [{ menuItemId: item._id.toString(), price: Math.max(item.price - 1, 1) }],
        price: Math.max(item.price - 1, 1),
        isVegetarian: item.isVegan,
        isActive: true,
      };
    });

    return this.weeklyMenuModel.insertMany([
      {
        locationId,
        title: `${this.demoPrefix} Wochenkarte`,
        weekStart,
        note: 'Demo-Wochenkarte für Tests',
        isActive: true,
        days,
      },
    ]);
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
        senderRoles: actor.roles,
        targetRoles: [Role.Service],
        message: 'Bitte Tisch 2 für die Reservierung vorbereiten.',
        priority: InternalMessagePriority.Important,
      },
      {
        locationId,
        senderId: actor.sub,
        senderName: 'Demo Admin',
        senderRoles: actor.roles,
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
    const wholesale = suppliers.find((supplier) => supplier.name === 'Demo Großhandel');
    const freshMarket = suppliers.find((supplier) => supplier.name === 'Frischemarkt Demo');

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
        type: index % 2 === 0 ? StockMovementType.Receipt : StockMovementType.Usage,
        quantityChange: index % 2 === 0 ? 5 : -2,
        quantityAfter: item.quantity,
        note: `${this.demoPrefix} Startbewegung`,
        actorId: actor.sub,
      })),
    );
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
          { title: 'Spülmaschine auf Funktion und Chemie prüfen', isDone: false },
          { title: 'Sauberes Geschirr, Besteck und Gläser sortieren', isDone: false },
          { title: 'Spülbereich reinigen und Müll trennen', isDone: false },
        ],
      },
    ]);
  }

  private atTime(date: Date, hours: number, minutes: number): Date {
    const result = new Date(date);
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
