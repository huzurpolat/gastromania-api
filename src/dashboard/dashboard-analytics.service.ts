import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Role } from '../auth/enums/role.enum';
import {
  Checklist,
  ChecklistStatus,
} from '../checklists/schemas/checklist.schema';
import { DutyShift } from '../duty-schedules/schemas/duty-shift.schema';
import { Location } from '../locations/schemas/location.schema';
import { Order, OrderStatus } from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationStatus,
} from '../reservations/schemas/reservation.schema';
import { StockItem } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementType,
} from '../stock/schemas/stock-movement.schema';
import { RestaurantTable, TableStatus } from '../tables/schemas/table.schema';
import { TimeEntry } from '../time-tracking/schemas/time-entry.schema';
import { User } from '../users/schemas/user.schema';
import { DashboardQueryDto, DashboardRange } from './dto/dashboard-query.dto';
import { DashboardNotificationSeverity } from './schemas/notification.schema';
import {
  DailyClosing,
  DailyClosingStatus,
} from '../daily-closings/schemas/daily-closing.schema';

export interface ResolvedDashboardQuery {
  locationIds?: string[];
  locationId?: string;
  range: DashboardRange;
  from: Date;
  to: Date;
}

export interface DashboardAlert {
  id: string;
  title: string;
  message: string;
  severity: DashboardNotificationSeverity;
  source: string;
  referenceId?: string;
  createdAt: string;
}

export interface CountAggregate {
  _id: string | number | null;
  count: number;
  guests?: number;
}

export interface TotalAggregate {
  total?: number;
}

export interface InventoryAggregate {
  items?: number;
  value?: number;
  lowStockItems?: number;
  unavailableItems?: number;
}

@Injectable()
export class DashboardAnalyticsService {
  constructor(
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<Reservation>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTable>,
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntry>,
    @InjectModel(Checklist.name)
    private readonly checklistModel: Model<Checklist>,
    @InjectModel(DutyShift.name)
    private readonly dutyShiftModel: Model<DutyShift>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItem>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovement>,
    @InjectModel(DailyClosing.name)
    private readonly dailyClosingModel: Model<DailyClosing>,
  ) {}

  resolveQuery(
    user: AuthenticatedUser,
    query: DashboardQueryDto,
  ): ResolvedDashboardQuery {
    const range = query.range ?? 'today';
    const { from, to } = this.resolvePeriod(range, query.from, query.to);
    const isGlobalUser =
      user.roles.includes(Role.PlatformAdmin) || user.roles.includes(Role.SuperAdmin);

    if (isGlobalUser) {
      return {
        range,
        from,
        to,
        locationId: query.locationId,
        locationIds: query.locationId ? [query.locationId] : undefined,
      };
    }

    const allowedLocationIds = user.locationIds?.length
      ? user.locationIds
      : user.locationIds === undefined
        ? []
        : user.locationIds;

    if (query.locationId && !allowedLocationIds.includes(query.locationId)) {
      throw new ForbiddenException('Standort ist nicht freigegeben');
    }

    return {
      range,
      from,
      to,
      locationId: query.locationId,
      locationIds: query.locationId ? [query.locationId] : allowedLocationIds,
    };
  }

  async getOverview(user: AuthenticatedUser, query: DashboardQueryDto) {
    const resolved = this.resolveQuery(user, query);
    const today = this.dayRange(new Date());
    const yesterday = this.dayRange(this.addDays(new Date(), -1));
    const locationFilter = this.locationFilter(resolved);
    const todayFilter = {
      ...locationFilter,
      createdAt: { $gte: today.from, $lte: today.to },
    };
    const yesterdayFilter = {
      ...locationFilter,
      createdAt: { $gte: yesterday.from, $lte: yesterday.to },
    };
    const nonCancelled = { status: { $ne: OrderStatus.Cancelled } };

    const [
      locations,
      revenueToday,
      revenueYesterday,
      ordersToday,
      ordersYesterday,
      openOrders,
      reservationsToday,
      reservationsThisWeek,
      tablesTotal,
      tablesOccupied,
      employeesInService,
      checklistOpenTasks,
      inventory,
      dailyClosing,
      alerts,
    ] = await Promise.all([
      this.availableLocations(user),
      this.sumOrders({ ...todayFilter, ...nonCancelled }, '$total'),
      this.sumOrders({ ...yesterdayFilter, ...nonCancelled }, '$total'),
      this.orderModel.countDocuments({ ...todayFilter, ...nonCancelled }),
      this.orderModel.countDocuments({ ...yesterdayFilter, ...nonCancelled }),
      this.orderModel.countDocuments({
        ...locationFilter,
        status: { $in: this.activeOrderStatuses() },
      }),
      this.reservationModel.countDocuments({
        ...locationFilter,
        startTime: { $gte: today.from, $lte: today.to },
        status: { $ne: ReservationStatus.Cancelled },
      }),
      this.reservationModel.countDocuments({
        ...locationFilter,
        startTime: {
          $gte: this.startOfWeek(new Date()),
          $lte: this.endOfWeek(new Date()),
        },
        status: { $ne: ReservationStatus.Cancelled },
      }),
      this.tableModel.countDocuments({ ...locationFilter, isActive: true }),
      this.tableModel.countDocuments({
        ...locationFilter,
        isActive: true,
        status: TableStatus.Occupied,
      }),
      this.timeEntryModel.countDocuments({
        ...locationFilter,
        clockOut: { $exists: false },
      }),
      this.countOpenChecklistTasks(locationFilter, today.from, today.to),
      this.inventorySummary(locationFilter),
      this.dailyClosingSummary(locationFilter, today.from, today.to),
      this.alerts(user, resolved),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      range: resolved.range,
      selectedLocationId: resolved.locationId,
      locations,
      kpis: {
        revenueToday,
        revenueTrend: this.percentChange(revenueToday, revenueYesterday),
        ordersToday,
        ordersTrend: this.percentChange(ordersToday, ordersYesterday),
        averageOrderValue: ordersToday > 0 ? revenueToday / ordersToday : 0,
        openOrders,
        reservationsToday,
        reservationsThisWeek,
        tableUtilization:
          tablesTotal > 0 ? (tablesOccupied / tablesTotal) * 100 : 0,
        employeesInService,
        openChecklistTasks: checklistOpenTasks,
        inventoryValue: inventory.value,
        lowStockItems: inventory.lowStockItems,
        dailyClosingOpen: dailyClosing.open,
        dailyClosingCompleted: dailyClosing.completed,
        dailyClosingIssues: dailyClosing.issues,
      },
      alerts,
    };
  }

  async getSales(user: AuthenticatedUser, query: DashboardQueryDto) {
    const resolved = this.resolveQuery(user, query);
    const filter = {
      ...this.locationFilter(resolved),
      status: { $ne: OrderStatus.Cancelled },
      createdAt: { $gte: resolved.from, $lte: resolved.to },
    };

    const [timeline, byPaymentStatus, byLocation] = await Promise.all([
      this.orderTimeline(filter, resolved.range),
      this.orderModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$paymentStatus',
            total: { $sum: '$total' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.orderModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$locationId',
            total: { $sum: '$total' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
    ]);

    return { timeline, byPaymentStatus, byLocation };
  }

  async getOrders(user: AuthenticatedUser, query: DashboardQueryDto) {
    const resolved = this.resolveQuery(user, query);
    const filter = {
      ...this.locationFilter(resolved),
      createdAt: { $gte: resolved.from, $lte: resolved.to },
    };
    const [byStatus, byArea, latest, overdue] = await Promise.all([
      this.orderModel.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$total' },
          },
        },
        { $sort: { count: -1 } },
      ]),
      this.orderModel.aggregate([
        { $match: filter },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productionArea',
            count: { $sum: '$items.quantity' },
          },
        },
        { $sort: { count: -1 } },
      ]),
      this.orderModel.find(filter).sort({ createdAt: -1 }).limit(10).lean(),
      this.orderModel.countDocuments({
        ...this.locationFilter(resolved),
        status: { $in: this.activeOrderStatuses() },
        createdAt: { $lt: this.addMinutes(new Date(), -30) },
      }),
    ]);

    return { byStatus, byArea, latest, overdue };
  }

  async getInventory(user: AuthenticatedUser, query: DashboardQueryDto) {
    const resolved = this.resolveQuery(user, query);
    const locationFilter = this.locationFilter(resolved);
    const [summary, criticalItems, movements] = await Promise.all([
      this.inventorySummary(locationFilter),
      this.stockItemModel
        .find({
          ...locationFilter,
          isArchived: false,
          $expr: { $lte: ['$quantity', '$minQuantity'] },
        })
        .sort({ quantity: 1, name: 1 })
        .limit(20)
        .lean(),
      this.stockMovementModel.aggregate([
        {
          $match: {
            ...locationFilter,
            createdAt: { $gte: resolved.from, $lte: resolved.to },
          },
        },
        {
          $group: {
            _id: '$type',
            value: { $sum: '$valueNet' },
            count: { $sum: 1 },
          },
        },
        { $sort: { value: -1 } },
      ]),
    ]);

    return { summary, criticalItems, movements };
  }

  async getReservations(user: AuthenticatedUser, query: DashboardQueryDto) {
    const resolved = this.resolveQuery(user, query);
    const locationFilter = this.locationFilter(resolved);
    const filter = {
      ...locationFilter,
      startTime: { $gte: resolved.from, $lte: resolved.to },
    };
    const [byStatus, byHour, latest] = await Promise.all([
      this.reservationModel.aggregate<CountAggregate>([
        { $match: filter },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            guests: { $sum: '$partySize' },
          },
        },
      ]),
      this.reservationModel.aggregate<CountAggregate>([
        { $match: filter },
        {
          $group: {
            _id: { $hour: '$startTime' },
            count: { $sum: 1 },
            guests: { $sum: '$partySize' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      this.reservationModel
        .find(filter)
        .sort({ startTime: 1 })
        .limit(10)
        .lean(),
    ]);

    const total = byStatus.reduce((sum, item) => sum + item.count, 0);
    const noShows =
      byStatus.find((item) => item._id === ReservationStatus.NoShow)?.count ??
      0;

    return {
      byStatus,
      byHour,
      latest,
      noShowRate: total > 0 ? (noShows / total) * 100 : 0,
    };
  }

  async getEmployees(user: AuthenticatedUser, query: DashboardQueryDto) {
    const resolved = this.resolveQuery(user, query);
    const locationFilter = this.locationFilter(resolved);
    const now = new Date();
    const [activeUsers, inService, plannedShifts, openTimeEntries] =
      await Promise.all([
        this.userModel.countDocuments({
          isActive: true,
          ...this.userLocationFilter(resolved),
        }),
        this.timeEntryModel.countDocuments({
          ...locationFilter,
          clockOut: { $exists: false },
        }),
        this.dutyShiftModel
          .find({
            ...locationFilter,
            startTime: { $lte: now },
            endTime: { $gte: now },
          })
          .sort({ startTime: 1 })
          .lean(),
        this.timeEntryModel
          .find({ ...locationFilter, clockOut: { $exists: false } })
          .lean(),
      ]);

    return { activeUsers, inService, plannedShifts, openTimeEntries };
  }

  async getFinance(user: AuthenticatedUser, query: DashboardQueryDto) {
    const resolved = this.resolveQuery(user, query);
    const locationFilter = this.locationFilter(resolved);
    const today = this.dayRange(new Date());
    const thisMonth = {
      from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      to: new Date(),
    };
    const revenueFilter = (from: Date, to: Date) => ({
      ...locationFilter,
      status: { $ne: OrderStatus.Cancelled },
      createdAt: { $gte: from, $lte: to },
    });
    const [dayRevenue, rangeRevenue, monthRevenue, costOfGoods] =
      await Promise.all([
        this.sumOrders(revenueFilter(today.from, today.to), '$total'),
        this.sumOrders(revenueFilter(resolved.from, resolved.to), '$total'),
        this.sumOrders(revenueFilter(thisMonth.from, thisMonth.to), '$total'),
        this.sumStockMovements(
          {
            ...locationFilter,
            type: {
              $in: [
                StockMovementType.Usage,
                StockMovementType.OrderConsumption,
                StockMovementType.OrderQuantityAdjustment,
                StockMovementType.Shrinkage,
                StockMovementType.Breakage,
                StockMovementType.Spoilage,
                StockMovementType.Loss,
              ],
            },
            createdAt: { $gte: resolved.from, $lte: resolved.to },
          },
          '$valueNet',
        ),
      ]);

    return {
      dayRevenue,
      rangeRevenue,
      monthRevenue,
      costOfGoods,
      contributionMargin: rangeRevenue - costOfGoods,
      contributionMarginRate:
        rangeRevenue > 0
          ? ((rangeRevenue - costOfGoods) / rangeRevenue) * 100
          : 0,
    };
  }

  async alerts(
    user: AuthenticatedUser,
    query: DashboardQueryDto | ResolvedDashboardQuery,
  ) {
    const resolved =
      'from' in query && query.from instanceof Date
        ? (query as ResolvedDashboardQuery)
        : this.resolveQuery(user, query as DashboardQueryDto);
    const locationFilter = this.locationFilter(resolved);
    const [lowStock, overdueOrders, upcomingReservations, openChecklists] =
      await Promise.all([
        this.stockItemModel
          .find({
            ...locationFilter,
            isArchived: false,
            $expr: { $lte: ['$quantity', '$minQuantity'] },
          })
          .sort({ quantity: 1 })
          .limit(5)
          .lean(),
        this.orderModel
          .find({
            ...locationFilter,
            status: { $in: this.activeOrderStatuses() },
            createdAt: { $lt: this.addMinutes(new Date(), -30) },
          })
          .sort({ createdAt: 1 })
          .limit(5)
          .lean(),
        this.reservationModel
          .find({
            ...locationFilter,
            startTime: { $gte: new Date(), $lte: this.addHours(new Date(), 2) },
            status: {
              $in: [ReservationStatus.Requested, ReservationStatus.Confirmed],
            },
          })
          .sort({ startTime: 1 })
          .limit(5)
          .lean(),
        this.countOpenChecklistTasks(
          locationFilter,
          this.dayRange(new Date()).from,
          this.dayRange(new Date()).to,
        ),
      ]);

    const alerts: DashboardAlert[] = [];

    for (const item of lowStock) {
      alerts.push({
        id: `stock-${String(item._id)}`,
        title: 'Mindestbestand erreicht',
        message: `${item.name}: ${item.quantity} ${item.unit} verfuegbar`,
        severity:
          item.quantity <= 0
            ? DashboardNotificationSeverity.Danger
            : DashboardNotificationSeverity.Warning,
        source: 'inventory',
        referenceId: String(item._id),
        createdAt: new Date().toISOString(),
      });
    }

    for (const order of overdueOrders) {
      alerts.push({
        id: `order-${String(order._id)}`,
        title: 'Bestellung wartet zu lange',
        message: `${order.orderNumber ?? String(order._id)} ist seit mehr als 30 Minuten offen`,
        severity: DashboardNotificationSeverity.Warning,
        source: 'orders',
        referenceId: String(order._id),
        createdAt: new Date().toISOString(),
      });
    }

    for (const reservation of upcomingReservations) {
      alerts.push({
        id: `reservation-${String(reservation._id)}`,
        title: 'Reservierung in Kuerze',
        message: `${reservation.guestName} mit ${reservation.partySize} Gaesten`,
        severity: DashboardNotificationSeverity.Info,
        source: 'reservations',
        referenceId: String(reservation._id),
        createdAt: new Date().toISOString(),
      });
    }

    if (openChecklists > 0) {
      alerts.push({
        id: 'checklists-open-today',
        title: 'Offene Checklisten',
        message: `${openChecklists} Aufgaben sind heute noch offen`,
        severity: DashboardNotificationSeverity.Warning,
        source: 'checklists',
        createdAt: new Date().toISOString(),
      });
    }

    return alerts;
  }

  private async availableLocations(user: AuthenticatedUser) {
    const isGlobalUser =
      user.roles.includes(Role.PlatformAdmin) || user.roles.includes(Role.SuperAdmin);
    const filter = isGlobalUser
      ? { isActive: true }
      : { isActive: true, _id: { $in: user.locationIds ?? [] } };

    return this.locationModel
      .find(filter)
      .sort({ name: 1 })
      .select('_id name city')
      .lean();
  }

  private locationFilter(resolved: ResolvedDashboardQuery) {
    if (resolved.locationId) {
      return { locationId: resolved.locationId };
    }

    if (resolved.locationIds) {
      return { locationId: { $in: resolved.locationIds } };
    }

    return {};
  }

  private userLocationFilter(resolved: ResolvedDashboardQuery) {
    if (resolved.locationId) {
      return {
        $or: [
          { locationId: resolved.locationId },
          { locationIds: resolved.locationId },
        ],
      };
    }

    if (resolved.locationIds) {
      return {
        $or: [
          { locationId: { $in: resolved.locationIds } },
          { locationIds: { $in: resolved.locationIds } },
        ],
      };
    }

    return {};
  }

  private async sumOrders(filter: Record<string, unknown>, field: string) {
    const [result] = await this.orderModel.aggregate<TotalAggregate>([
      { $match: filter },
      { $group: { _id: null, total: { $sum: field } } },
    ]);

    return Number(result?.total ?? 0);
  }

  private async sumStockMovements(
    filter: Record<string, unknown>,
    field: string,
  ) {
    const [result] = await this.stockMovementModel.aggregate<TotalAggregate>([
      { $match: filter },
      { $group: { _id: null, total: { $sum: field } } },
    ]);

    return Math.abs(Number(result?.total ?? 0));
  }

  private async inventorySummary(locationFilter: Record<string, unknown>) {
    const [result] = await this.stockItemModel.aggregate<InventoryAggregate>([
      { $match: { ...locationFilter, isArchived: false } },
      {
        $group: {
          _id: null,
          items: { $sum: 1 },
          value: { $sum: { $multiply: ['$quantity', '$purchasePriceNet'] } },
          lowStockItems: {
            $sum: { $cond: [{ $lte: ['$quantity', '$minQuantity'] }, 1, 0] },
          },
          unavailableItems: {
            $sum: { $cond: [{ $lte: ['$quantity', 0] }, 1, 0] },
          },
        },
      },
    ]);

    return {
      items: Number(result?.items ?? 0),
      value: Number(result?.value ?? 0),
      lowStockItems: Number(result?.lowStockItems ?? 0),
      unavailableItems: Number(result?.unavailableItems ?? 0),
    };
  }

  private async dailyClosingSummary(
    locationFilter: Record<string, unknown>,
    from: Date,
    to: Date,
  ) {
    const closings = await this.dailyClosingModel
      .find({ ...locationFilter, businessDate: { $gte: from, $lte: to } })
      .lean();

    return {
      open: closings.filter((closing) =>
        [
          DailyClosingStatus.Draft,
          DailyClosingStatus.ReadyForReview,
          DailyClosingStatus.Reopened,
        ].includes(closing.status),
      ).length,
      completed: closings.filter((closing) =>
        [
          DailyClosingStatus.Completed,
          DailyClosingStatus.CompletedWithIssues,
          DailyClosingStatus.Locked,
        ].includes(closing.status),
      ).length,
      issues: closings.filter(
        (closing) => closing.status === DailyClosingStatus.CompletedWithIssues,
      ).length,
    };
  }

  private async countOpenChecklistTasks(
    locationFilter: Record<string, unknown>,
    from: Date,
    to: Date,
  ) {
    const [result] = await this.checklistModel.aggregate<CountAggregate>([
      {
        $match: {
          ...locationFilter,
          date: { $gte: from, $lte: to },
          status: { $ne: ChecklistStatus.Done },
        },
      },
      { $unwind: '$tasks' },
      { $match: { 'tasks.isDone': false } },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]);

    return Number(result?.count ?? 0);
  }

  private async orderTimeline(
    filter: Record<string, unknown>,
    range: DashboardRange,
  ) {
    const format =
      range === '12m' ? '%Y-%m' : range === 'today' ? '%H:00' : '%Y-%m-%d';
    return this.orderModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            $dateToString: {
              format,
              date: '$createdAt',
              timezone: 'Europe/Berlin',
            },
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  private activeOrderStatuses() {
    return [
      OrderStatus.New,
      OrderStatus.Accepted,
      OrderStatus.Preparing,
      OrderStatus.Ready,
    ];
  }

  private percentChange(current: number, previous: number) {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }

    return ((current - previous) / previous) * 100;
  }

  private resolvePeriod(range: DashboardRange, from?: string, to?: string) {
    if (from && to) {
      return { from: new Date(from), to: new Date(to) };
    }

    const now = new Date();
    if (range === 'today') {
      return this.dayRange(now);
    }

    if (range === '7d') {
      return { from: this.addDays(now, -6), to: now };
    }

    if (range === '30d') {
      return { from: this.addDays(now, -29), to: now };
    }

    return {
      from: new Date(now.getFullYear(), now.getMonth() - 11, 1),
      to: now,
    };
  }

  private dayRange(date: Date) {
    const from = new Date(date);
    from.setHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setHours(23, 59, 59, 999);
    return { from, to };
  }

  private startOfWeek(date: Date) {
    const start = new Date(date);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private endOfWeek(date: Date) {
    const end = this.startOfWeek(date);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private addHours(date: Date, hours: number) {
    const next = new Date(date);
    next.setHours(next.getHours() + hours);
    return next;
  }

  private addMinutes(date: Date, minutes: number) {
    const next = new Date(date);
    next.setMinutes(next.getMinutes() + minutes);
    return next;
  }
}
