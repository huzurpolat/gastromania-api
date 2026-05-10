import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
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
  TableStatus,
} from '../tables/schemas/table.schema';
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
    const tables = await this.createTables(locationId);
    const menuItems = await this.createMenuItems();
    const orders = await this.createOrders(locationId, tables);
    const reservations = await this.createReservations(locationId, tables);
    const dutyShifts = await this.createDutyShifts(locationId, users);
    const timeEntries = await this.createTimeEntries(locationId, users);
    const weeklyMenus = await this.createWeeklyMenu(locationId, menuItems);
    const internalMessages = await this.createInternalMessages(locationId, actor);

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
        status: TableStatus.Occupied,
        isActive: true,
      },
      {
        name: 'Tisch 2',
        locationId,
        seats: 4,
        area: 'Innenraum',
        status: TableStatus.Reserved,
        isActive: true,
      },
      {
        name: 'Tisch 3',
        locationId,
        seats: 4,
        area: 'Innenraum',
        status: TableStatus.Available,
        isActive: true,
      },
      {
        name: 'Tisch 4',
        locationId,
        seats: 6,
        area: 'Terrasse',
        status: TableStatus.Available,
        isActive: true,
      },
      {
        name: 'Bar 1',
        locationId,
        seats: 2,
        area: 'Bar',
        status: TableStatus.Occupied,
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
    return this.orderModel.insertMany([
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
    ]);
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
