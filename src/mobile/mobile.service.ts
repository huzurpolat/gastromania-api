import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Role } from '../auth/enums/role.enum';
import {
  Checklist,
  ChecklistStatus,
} from '../checklists/schemas/checklist.schema';
import { Location } from '../locations/schemas/location.schema';
import { MenuItem } from '../menu-items/schemas/menu-item.schema';
import { OrdersService } from '../orders/orders.service';
import {
  Order,
  OrderPriority,
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/schemas/reservation.schema';
import { RestaurantTable } from '../tables/schemas/table.schema';
import { MobileQueryDto } from './dto/mobile-query.dto';
import {
  CreateMobileOrderDto,
  UpdateMobileOrderDto,
} from './dto/mobile-order.dto';
import { UpdateMobileTaskDto } from './dto/update-mobile-task.dto';

interface MobileResolvedQuery {
  tenantId: string;
  locationIds?: string[];
  locationId?: string;
  from: Date;
  to: Date;
}

@Injectable()
export class MobileService {
  constructor(
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTable>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<Reservation>,
    @InjectModel(Checklist.name)
    private readonly checklistModel: Model<Checklist>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItem>,
    private readonly ordersService: OrdersService,
  ) {}

  async dashboard(actor: AuthenticatedUser, query: MobileQueryDto) {
    const resolved = this.resolveQuery(actor, query);
    const locationFilter = this.locationFilter(resolved);
    const todayRange = this.dayRange(
      query.date ? new Date(query.date) : new Date(),
    );
    const orderActive = { status: { $in: this.activeStatuses() } };

    const [
      locations,
      tables,
      ownOrders,
      tasks,
      reservations,
      readyOrders,
      notifications,
    ] = await Promise.all([
      this.locations(actor),
      this.tables(actor, query),
      this.orderModel
        .find({ ...locationFilter, ...orderActive })
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean(),
      this.tasks(actor, query),
      this.reservations(actor, query),
      this.orderModel
        .find({
          ...locationFilter,
          status: OrderStatus.Ready,
          createdAt: { $gte: todayRange.from, $lte: todayRange.to },
        })
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean(),
      this.notifications(actor, query),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      locations,
      kpis: {
        activeTables: tables.filter(
          (table) => String(table.status) !== 'Available',
        ).length,
        ownOrders: ownOrders.length,
        openTasks: tasks.filter((task) => task.status !== ChecklistStatus.Done)
          .length,
        readyOrders: readyOrders.length,
        reservationsToday: reservations.length,
        notifications: notifications.length,
      },
      tables: tables.slice(0, 12),
      orders: ownOrders,
      tasks: tasks.slice(0, 10),
      reservations: reservations.slice(0, 8),
      readyOrders,
      notifications,
      offline: {
        queueSupported: true,
        syncEndpoint: '/api/mobile/orders',
      },
    };
  }

  async tables(actor: AuthenticatedUser, query: MobileQueryDto) {
    const resolved = this.resolveQuery(actor, query);
    const locationFilter = this.locationFilter(resolved);
    const [tables, orders, reservations] = await Promise.all([
      this.tableModel
        .find({ ...locationFilter, isActive: true })
        .sort({ name: 1 })
        .lean(),
      this.orderModel
        .find({ ...locationFilter, status: { $in: this.activeStatuses() } })
        .sort({ createdAt: -1 })
        .lean(),
      this.reservationModel
        .find({
          ...locationFilter,
          startTime: { $gte: resolved.from, $lte: resolved.to },
          status: {
            $in: [ReservationStatus.Requested, ReservationStatus.Confirmed],
          },
        })
        .lean(),
    ]);

    return tables.map((table) => {
      const currentOrder = orders.find(
        (order) => order.tableId === String(table._id),
      );
      const reservation = reservations.find(
        (entry) => entry.tableId === String(table._id),
      );
      const status = currentOrder
        ? 'Bestellung offen'
        : reservation
          ? 'Reserviert'
          : table.status;

      return {
        ...table,
        _id: String(table._id),
        status,
        guestCount: reservation?.partySize ?? 0,
        currentOrder,
        openAmount: currentOrder?.total ?? 0,
        reservation,
        qrPayload: `gastromania://table/${String(table._id)}`,
      };
    });
  }

  async orders(actor: AuthenticatedUser, query: MobileQueryDto) {
    const resolved = this.resolveQuery(actor, query);
    const filter = {
      ...this.locationFilter(resolved),
      ...(query.tableId ? { tableId: query.tableId } : {}),
    };

    return this.orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async createOrder(actor: AuthenticatedUser, payload: CreateMobileOrderDto) {
    this.assertCanUseLocation(actor, payload.locationId);
    return this.ordersService.create(
      {
        ...payload,
        status: OrderStatus.New,
        priority: payload.priority ?? OrderPriority.Normal,
        paymentStatus: PaymentStatus.Open,
        employeeId: actor.sub,
        employeeName: actor.email,
        items: payload.items,
      },
      actor,
    );
  }

  async updateOrder(
    actor: AuthenticatedUser,
    id: string,
    payload: UpdateMobileOrderDto,
  ) {
    const order = await this.ordersService.findOne(id, actor);
    this.assertCanUseLocation(actor, order.locationId);
    return this.ordersService.update(id, payload, actor);
  }

  async tasks(actor: AuthenticatedUser, query: MobileQueryDto) {
    const resolved = this.resolveQuery(actor, query);
    const checklists = await this.checklistModel
      .find({
        ...this.locationFilter(resolved),
        date: { $gte: resolved.from, $lte: resolved.to },
      })
      .sort({ area: 1, title: 1 })
      .lean();

    return checklists.flatMap((checklist) =>
      checklist.tasks.map((task) => ({
        _id: String(task._id),
        checklistId: String(checklist._id),
        locationId: checklist.locationId,
        area: checklist.area,
        checklistTitle: checklist.title,
        title: task.title,
        note: task.note,
        status: task.isDone ? ChecklistStatus.Done : checklist.status,
        isDone: task.isDone,
        doneBy: task.doneBy,
        doneAt: task.doneAt,
      })),
    );
  }

  async updateTask(
    actor: AuthenticatedUser,
    checklistId: string,
    taskId: string,
    payload: UpdateMobileTaskDto,
  ) {
    const checklist = await this.checklistModel.findById(checklistId).exec();
    if (!checklist) throw new NotFoundException('Aufgabe nicht gefunden');
    this.assertCanUseLocation(actor, checklist.locationId);
    const task = checklist.tasks.find((entry) => String(entry._id) === taskId);
    if (!task) throw new NotFoundException('Aufgabe nicht gefunden');

    task.isDone = payload.isDone;
    task.note = payload.note ?? task.note;
    task.doneBy = payload.isDone ? actor.sub : undefined;
    task.doneAt = payload.isDone ? new Date() : undefined;
    const done = checklist.tasks.filter((entry) => entry.isDone).length;
    checklist.status =
      done === 0
        ? ChecklistStatus.Open
        : done === checklist.tasks.length
          ? ChecklistStatus.Done
          : ChecklistStatus.InProgress;

    await checklist.save();
    return {
      _id: taskId,
      checklistId,
      title: task.title,
      status: checklist.status,
      isDone: task.isDone,
      doneAt: task.doneAt,
    };
  }

  async reservations(actor: AuthenticatedUser, query: MobileQueryDto) {
    const resolved = this.resolveQuery(actor, query);
    return this.reservationModel
      .find({
        ...this.locationFilter(resolved),
        startTime: { $gte: resolved.from, $lte: resolved.to },
      })
      .sort({ startTime: 1 })
      .lean();
  }

  async notifications(actor: AuthenticatedUser, query: MobileQueryDto) {
    const resolved = this.resolveQuery(actor, query);
    const [readyOrders, delayedOrders, upcomingReservations, openTasks] =
      await Promise.all([
        this.orderModel
          .find({ ...this.locationFilter(resolved), status: OrderStatus.Ready })
          .sort({ updatedAt: -1 })
          .limit(10)
          .lean(),
        this.orderModel
          .find({
            ...this.locationFilter(resolved),
            status: {
              $in: [
                OrderStatus.New,
                OrderStatus.Accepted,
                OrderStatus.Preparing,
              ],
            },
            createdAt: { $lt: this.addMinutes(new Date(), -25) },
          })
          .sort({ createdAt: 1 })
          .limit(10)
          .lean(),
        this.reservationModel
          .find({
            ...this.locationFilter(resolved),
            startTime: { $gte: new Date(), $lte: this.addHours(new Date(), 1) },
            status: {
              $in: [ReservationStatus.Requested, ReservationStatus.Confirmed],
            },
          })
          .sort({ startTime: 1 })
          .limit(10)
          .lean(),
        this.tasks(actor, query),
      ]);

    return [
      ...readyOrders.map((order) => ({
        id: `ready-${String(order._id)}`,
        title: 'Bestellung fertig',
        message: `${order.orderNumber ?? order.pickupNumber ?? 'Bestellung'} ist bereit`,
        severity: 'success',
        source: 'orders',
        referenceId: String(order._id),
        createdAt: new Date().toISOString(),
      })),
      ...delayedOrders.map((order) => ({
        id: `delay-${String(order._id)}`,
        title: 'Bestellung dauert laenger',
        message: `${order.orderNumber ?? 'Bestellung'} ist seit ueber 25 Minuten offen`,
        severity: 'warning',
        source: 'kds',
        referenceId: String(order._id),
        createdAt: new Date().toISOString(),
      })),
      ...upcomingReservations.map((reservation) => ({
        id: `reservation-${String(reservation._id)}`,
        title: 'Reservierung kommt gleich',
        message: `${reservation.guestName}, ${reservation.partySize} Personen`,
        severity: 'info',
        source: 'reservations',
        referenceId: String(reservation._id),
        createdAt: reservation.startTime,
      })),
      ...openTasks
        .filter((task) => !task.isDone)
        .slice(0, 5)
        .map((task) => ({
          id: `task-${task.checklistId}-${task._id}`,
          title: 'Offene Aufgabe',
          message: task.title,
          severity: 'warning',
          source: 'tasks',
          referenceId: task.checklistId,
          createdAt: new Date().toISOString(),
        })),
    ];
  }

  async menu(actor: AuthenticatedUser) {
    this.resolveQuery(actor, {});
    return this.menuItemModel
      .find({ isActive: true })
      .sort({ category: 1, name: 1 })
      .lean();
  }

  async locations(actor: AuthenticatedUser) {
    const locationFilter = this.actorLocationFilter(actor);
    return this.locationModel
      .find({ ...locationFilter, isActive: true })
      .sort({ name: 1 })
      .lean();
  }

  private resolveQuery(
    actor: AuthenticatedUser,
    query: MobileQueryDto,
  ): MobileResolvedQuery {
    const day = query.date ? new Date(query.date) : new Date();
    const range = this.dayRange(day);
    if (this.isPlatformAdmin(actor)) {
      throw new ForbiddenException(
        'Platform Admin darf keine operativen Mobile-Daten nutzen',
      );
    }
    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext fuer Mobile-Daten');
    }

    if (query.locationId) {
      this.assertCanUseLocation(actor, query.locationId);
    }

    const actorLocationIds = actor.locationIds ?? [];
    return {
      tenantId: actor.tenantId,
      locationId: query.locationId,
      locationIds: query.locationId ? [query.locationId] : actorLocationIds,
      ...range,
    };
  }

  private assertCanUseLocation(actor: AuthenticatedUser, locationId: string) {
    if (this.isPlatformAdmin(actor)) {
      throw new ForbiddenException(
        'Platform Admin darf keine operativen Mobile-Daten nutzen',
      );
    }
    if (!(actor.locationIds ?? []).includes(locationId)) {
      throw new ForbiddenException('Kein Zugriff auf diese Filiale');
    }
  }

  private actorLocationFilter(actor: AuthenticatedUser) {
    if (this.isPlatformAdmin(actor)) {
      throw new ForbiddenException(
        'Platform Admin darf keine operativen Mobile-Daten nutzen',
      );
    }
    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext fuer Mobile-Daten');
    }
    return { tenantId: actor.tenantId, _id: { $in: actor.locationIds ?? [] } };
  }

  private locationFilter(resolved: MobileResolvedQuery) {
    if (resolved.locationId) {
      return { tenantId: resolved.tenantId, locationId: resolved.locationId };
    }
    if (resolved.locationIds)
      return {
        tenantId: resolved.tenantId,
        locationId: { $in: resolved.locationIds },
      };
    return { tenantId: resolved.tenantId };
  }

  private isPlatformAdmin(actor: AuthenticatedUser): boolean {
    return (
      actor.roles.includes(Role.PlatformAdminCode) ||
      actor.roles.includes(Role.PlatformAdmin) ||
      actor.roles.includes(Role.SuperAdmin)
    );
  }

  private activeStatuses() {
    return [
      OrderStatus.New,
      OrderStatus.Accepted,
      OrderStatus.Preparing,
      OrderStatus.Ready,
    ];
  }

  private dayRange(date: Date) {
    const from = new Date(date);
    from.setHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  private addMinutes(date: Date, minutes: number) {
    const next = new Date(date);
    next.setMinutes(next.getMinutes() + minutes);
    return next;
  }

  private addHours(date: Date, hours: number) {
    const next = new Date(date);
    next.setHours(next.getHours() + hours);
    return next;
  }
}
