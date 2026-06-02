import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { hasAnyRole } from '../auth/role-utils';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  MenuItem,
  MenuItemDocument,
} from '../menu-items/schemas/menu-item.schema';
import {
  CourseType,
  Order,
  OrderDocument,
  OrderItem,
  OrderItemStatus,
  OrderPriority,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  ProductionArea,
} from '../orders/schemas/order.schema';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import { RealtimeService } from '../realtime/realtime.service';
import { CancelCounterOrderDto } from './dto/cancel-counter-order.dto';
import { CreateCounterOrderDto } from './dto/create-counter-order.dto';
import { PayCounterOrderDto } from './dto/pay-counter-order.dto';
import { UpdateCounterSettingsDto } from './dto/update-counter-settings.dto';
import { UpdateCounterStatusDto } from './dto/update-counter-status.dto';
import { CounterPaymentService } from './counter-payment.service';
import { PickupNumberService } from './pickup-number.service';
import {
  CounterOrderStatusLog,
  CounterOrderStatusLogDocument,
} from './schemas/counter-order-status-log.schema';

type CounterOrderQuery = Record<string, unknown>;

export interface CounterOrderFilters {
  locationId?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  date?: string;
  q?: string;
}

export interface CounterReportFilters {
  locationId?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class CounterOrderService {
  private readonly activeStatuses = [
    OrderStatus.New,
    OrderStatus.Accepted,
    OrderStatus.Preparing,
    OrderStatus.Ready,
  ];

  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(CounterOrderStatusLog.name)
    private readonly logModel: Model<CounterOrderStatusLogDocument>,
    private readonly pickupNumbers: PickupNumberService,
    private readonly payments: CounterPaymentService,
    private readonly recipeInventoryService: RecipeInventoryService,
    private readonly realtimeService: RealtimeService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    dto: CreateCounterOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    this.validateObjectId(dto.locationId, 'Standort-ID');
    this.assertCounterOrderRole(actor);
    await this.accessPolicy.assertCanAccessLocation(actor, dto.locationId);

    const pickupNumber = await this.pickupNumbers.nextPickupNumber(
      dto.locationId,
      actor.companyId,
    );
    const menuItemIds = dto.items.map((item) => item.menuItemId);
    const menuItems = await this.menuItemModel
      .find({ _id: { $in: menuItemIds }, isActive: true })
      .exec();
    const menuItemById = new Map(
      menuItems.map((item) => [item._id.toString(), item]),
    );
    const orderItems = dto.items.map((item) => {
      const menuItem = menuItemById.get(item.menuItemId);

      if (!menuItem) {
        throw new BadRequestException(
          `Menueartikel ${item.menuItemId} ist nicht verfuegbar`,
        );
      }

      const price = menuItem.sellingPrice ?? menuItem.price;
      const specialRequests = [
        ...(item.specialRequests ?? []),
        ...(item.note ? [item.note] : []),
      ];

      return {
        productId: menuItem._id.toString(),
        menuItemId: menuItem._id.toString(),
        name: menuItem.name,
        quantity: item.quantity,
        price,
        totalPrice: this.roundMoney(price * item.quantity),
        note: item.note,
        isKitchenItem: item.isKitchenItem ?? menuItem.isKitchenItem,
        status: OrderItemStatus.Open,
        productionArea:
          item.productionArea ??
          (menuItem.isKitchenItem
            ? ProductionArea.Kitchen
            : ProductionArea.Counter),
        courseType: item.courseType ?? this.courseTypeFor(menuItem.category),
        specialRequests,
        allergens: item.allergens ?? [],
      } satisfies OrderItem;
    });
    const totals = this.calculateTotals(orderItems);
    const status = OrderStatus.Accepted;

    const order = await this.orderModel.create({
      companyId: actor.companyId,
      locationId: dto.locationId,
      orderNumber: `T${pickupNumber}`,
      source: OrderSource.Counter,
      pickupNumber,
      guestCount: 1,
      customerName: dto.customerName,
      notes: dto.notes,
      priority: dto.priority ?? OrderPriority.Normal,
      status,
      statusTimestamps: { [status]: new Date() },
      paymentStatus: PaymentStatus.Open,
      items: orderItems,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      createdBy: actor.sub,
      employeeId: actor.sub,
      employeeName: actor.email,
      assignedWaiterId: actor.sub,
    });

    await this.deductInventoryIfNeeded(order, actor);
    await this.log(order, undefined, status, 'counter.order.created', actor);
    this.publish('counter.order.created', order, actor);
    this.publish('order.created', order, actor);

    return order;
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: CounterOrderFilters = {},
  ): Promise<OrderDocument[]> {
    const query = await this.baseQuery(actor, filters.locationId);

    if (filters.status) query.status = filters.status;
    if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
    if (filters.date) query.createdAt = this.dayRange(filters.date);
    if (filters.q) {
      const regex = new RegExp(this.escapeRegex(filters.q), 'i');
      query.$or = [
        { orderNumber: regex },
        { pickupNumber: regex },
        { customerName: regex },
        { 'items.name': regex },
      ];
    }

    return this.orderModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');
    const order = await this.orderModel.findById(id).exec();

    if (
      !order ||
      order.source !== OrderSource.Counter ||
      !(await this.accessPolicy.canAccessLocation(actor, order.locationId))
    ) {
      throw new NotFoundException('Thekenbestellung nicht gefunden');
    }

    return order;
  }

  async updateStatus(
    id: string,
    dto: UpdateCounterStatusDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const order = await this.findOne(id, actor);
    this.assertStatusTransition(order.status, dto.status);
    this.assertCanSetStatus(actor, dto.status);

    const previousStatus = order.status;
    order.status = dto.status;
    order.statusTimestamps = {
      ...(order.statusTimestamps ?? {}),
      [dto.status]: new Date(),
    };

    if (dto.status === OrderStatus.Accepted) {
      await this.deductInventoryIfNeeded(order, actor);
    }
    if (dto.status === OrderStatus.Ready) {
      order.calledAt = undefined;
    }
    if (
      dto.status === OrderStatus.Served ||
      dto.status === OrderStatus.Closed
    ) {
      order.completedAt = new Date();
      order.completedBy = actor.sub;
    }
    if (dto.status === OrderStatus.Cancelled) {
      await this.cancel(
        id,
        { reason: dto.reason ?? 'Statuswechsel auf Storniert' },
        actor,
      );
      return this.findOne(id, actor);
    }

    const saved = await order.save();
    await this.log(
      saved,
      previousStatus,
      dto.status,
      'counter.order.status.changed',
      actor,
      dto.reason,
    );
    this.publish('counter.order.status.changed', saved, actor, {
      previousStatus,
      nextStatus: dto.status,
    });
    this.publish('counter.order.statusChanged', saved, actor, {
      previousStatus,
      nextStatus: dto.status,
    });
    this.publish('counter.order.updated', saved, actor, {
      previousStatus,
      nextStatus: dto.status,
    });
    if (dto.status === OrderStatus.Ready) {
      this.publish('counter.order.ready', saved, actor, { previousStatus });
    }
    this.publish('order.status.changed', saved, actor, {
      previousStatus,
      nextStatus: dto.status,
    });

    return saved;
  }

  async history(id: string, actor: AuthenticatedUser) {
    const order = await this.findOne(id, actor);

    return this.logModel
      .find({ orderId: order._id.toString() })
      .sort({ createdAt: -1 })
      .exec();
  }

  async call(id: string, actor: AuthenticatedUser): Promise<OrderDocument> {
    const order = await this.findOne(id, actor);

    if (order.status !== OrderStatus.Ready) {
      throw new BadRequestException(
        'Nur ausgabebereite Bestellungen koennen aufgerufen werden',
      );
    }

    order.calledAt = new Date();
    const saved = await order.save();
    await this.log(
      saved,
      order.status,
      order.status,
      'counter.order.called',
      actor,
    );
    this.publish('counter.order.called', saved, actor);
    this.publish('order.called', saved, actor);

    return saved;
  }

  async pay(
    id: string,
    dto: PayCounterOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const order = await this.findOne(id, actor);
    const paid = await this.payments.pay(order, dto, actor);
    await this.log(paid, paid.status, paid.status, 'counter.order.paid', actor);

    return paid;
  }

  async complete(id: string, actor: AuthenticatedUser): Promise<OrderDocument> {
    const order = await this.findOne(id, actor);
    const settings = await this.pickupNumbers.getSettings(
      order.locationId,
      actor,
    );

    if (
      settings.requirePaymentBeforeComplete &&
      order.paymentStatus !== PaymentStatus.Paid
    ) {
      throw new BadRequestException(
        'Bestellung muss vor Abschluss bezahlt sein',
      );
    }
    if (![OrderStatus.Ready, OrderStatus.Served].includes(order.status)) {
      throw new BadRequestException(
        'Nur fertige Bestellungen koennen abgeschlossen werden',
      );
    }

    const previousStatus = order.status;
    order.status = OrderStatus.Served;
    order.completedAt = new Date();
    order.completedBy = actor.sub;
    order.statusTimestamps = {
      ...(order.statusTimestamps ?? {}),
      [OrderStatus.Served]: order.completedAt,
    };

    const saved = await order.save();
    await this.log(
      saved,
      previousStatus,
      saved.status,
      'counter.order.completed',
      actor,
    );
    this.publish('counter.order.completed', saved, actor, { previousStatus });
    this.publish('order.completed', saved, actor, { previousStatus });

    return saved;
  }

  async cancel(
    id: string,
    dto: CancelCounterOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const order = await this.findOne(id, actor);

    if ([OrderStatus.Closed, OrderStatus.Cancelled].includes(order.status)) {
      throw new BadRequestException(
        'Bestellung kann nicht mehr storniert werden',
      );
    }

    const previousStatus = order.status;
    if (
      (order.inventoryDeducted || order.inventoryConsumedAt) &&
      !order.inventoryReversedAt
    ) {
      const result = await this.recipeInventoryService.reverseOrder(
        order,
        actor.sub,
      );
      order.inventoryReversedAt = new Date();
      order.inventoryMovementIds = [
        ...(order.inventoryMovementIds ?? []),
        ...result.movementIds,
      ];
      order.inventoryWarnings = this.uniqueValues([
        ...(order.inventoryWarnings ?? []),
        ...result.warnings,
      ]);
    }

    const paidAmount = this.paidAmount(order);
    order.status = OrderStatus.Cancelled;
    order.cancelledAt = new Date();
    order.cancelledBy = actor.sub;
    order.cancelReason = dto.reason;
    order.refundTotal = paidAmount;
    order.paymentStatus =
      paidAmount > 0 ? PaymentStatus.Refunded : PaymentStatus.Cancelled;
    order.items = order.items.map((item) => ({
      ...item,
      status: OrderItemStatus.Cancelled,
      cancelledAt: item.cancelledAt ?? order.cancelledAt,
      cancelledBy: item.cancelledBy ?? actor.sub,
    }));

    const saved = await order.save();
    await this.log(
      saved,
      previousStatus,
      OrderStatus.Cancelled,
      'counter.order.cancelled',
      actor,
      dto.reason,
    );
    this.publish('counter.order.cancelled', saved, actor, { previousStatus });
    this.publish('order.cancelled', saved, actor, { previousStatus });

    return saved;
  }

  async pickupDisplay(actor: AuthenticatedUser, locationId?: string) {
    const query = await this.baseQuery(actor, locationId);
    query.status = { $in: this.activeStatuses };
    const orders = await this.orderModel
      .find(query)
      .sort({ createdAt: 1 })
      .exec();

    return {
      preparing: orders.filter((order) =>
        [OrderStatus.New, OrderStatus.Accepted, OrderStatus.Preparing].includes(
          order.status,
        ),
      ),
      ready: orders.filter((order) => order.status === OrderStatus.Ready),
      called: orders.filter((order) => Boolean(order.calledAt)),
      generatedAt: new Date(),
    };
  }

  async dashboard(actor: AuthenticatedUser, locationId?: string) {
    const todayQuery = await this.baseQuery(actor, locationId);
    todayQuery.createdAt = this.dayRange(new Date().toISOString());
    const orders = await this.orderModel.find(todayQuery).exec();
    const openOrders = orders.filter((order) =>
      this.activeStatuses.includes(order.status),
    );
    const readyOrders = orders.filter(
      (order) => order.status === OrderStatus.Ready,
    );
    const unpaidOrders = orders.filter(
      (order) => order.paymentStatus !== PaymentStatus.Paid,
    );
    const cancelledOrders = orders.filter(
      (order) => order.status === OrderStatus.Cancelled,
    );

    return {
      orderCount: orders.length,
      openOrders: openOrders.length,
      readyOrders: readyOrders.length,
      unpaidOrders: unpaidOrders.length,
      cancelledOrders: cancelledOrders.length,
      revenue: this.roundMoney(
        orders
          .filter((order) => order.paymentStatus === PaymentStatus.Paid)
          .reduce((sum, order) => sum + (order.total ?? 0), 0),
      ),
      averageWaitMinutes: this.averageWaitMinutes(openOrders),
    };
  }

  async report(actor: AuthenticatedUser, filters: CounterReportFilters = {}) {
    const query = await this.baseQuery(actor, filters.locationId);
    query.createdAt = this.dateRange(filters.from, filters.to);
    const orders = await this.orderModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
    const paidOrders = orders.filter(
      (order) => order.paymentStatus === PaymentStatus.Paid,
    );
    const cancelledOrders = orders.filter(
      (order) => order.status === OrderStatus.Cancelled,
    );
    const itemStats = new Map<
      string,
      { name: string; quantity: number; revenue: number }
    >();
    const paymentMethods = new Map<string, { count: number; amount: number }>();

    for (const order of orders) {
      for (const item of order.items ?? []) {
        const key = item.menuItemId ?? item.productId ?? item.name;
        const current = itemStats.get(key) ?? {
          name: item.name,
          quantity: 0,
          revenue: 0,
        };
        current.quantity += item.quantity;
        current.revenue += item.totalPrice ?? item.price * item.quantity;
        itemStats.set(key, current);
      }

      if (order.paymentStatus === PaymentStatus.Paid) {
        const method = order.paymentMethod ?? 'unknown';
        const current = paymentMethods.get(method) ?? { count: 0, amount: 0 };
        current.count += 1;
        current.amount += order.total ?? 0;
        paymentMethods.set(method, current);
      }
    }

    return {
      filters,
      summary: {
        orderCount: orders.length,
        revenue: this.roundMoney(
          paidOrders.reduce((sum, order) => sum + (order.total ?? 0), 0),
        ),
        averageWaitMinutes: this.averageWaitMinutes(orders),
        cancellationRate: orders.length
          ? cancelledOrders.length / orders.length
          : 0,
        cancelledOrders: cancelledOrders.length,
        unpaidOrders: orders.filter(
          (order) => order.paymentStatus !== PaymentStatus.Paid,
        ).length,
      },
      paymentMethods: [...paymentMethods.entries()].map(([method, stat]) => ({
        method,
        count: stat.count,
        amount: this.roundMoney(stat.amount),
      })),
      topItems: [...itemStats.entries()]
        .map(([menuItemId, stat]) => ({
          menuItemId,
          name: stat.name,
          quantity: stat.quantity,
          revenue: this.roundMoney(stat.revenue),
        }))
        .sort((first, second) => second.revenue - first.revenue)
        .slice(0, 10),
      orders,
    };
  }

  async reportCsv(
    actor: AuthenticatedUser,
    filters: CounterReportFilters = {},
  ) {
    const report = await this.report(actor, filters);
    const header = [
      'Abholnummer',
      'Status',
      'Zahlungsstatus',
      'Betrag',
      'Artikel',
      'Erstellt',
    ];
    const rows = report.orders.map((order) => [
      order.pickupNumber ?? order.orderNumber,
      order.status,
      order.paymentStatus ?? '',
      this.roundMoney(order.total ?? 0).toFixed(2),
      (order.items ?? [])
        .map((item) => `${item.quantity}x ${item.name}`)
        .join(' | '),
      (
        order as OrderDocument & { createdAt?: Date }
      ).createdAt?.toISOString() ?? '',
    ]);
    const content = [header, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(';'),
      )
      .join('\n');

    return {
      filename: `gastromania-counter-${new Date().toISOString().slice(0, 10)}.csv`,
      contentType: 'text/csv',
      content,
    };
  }

  getSettings(locationId: string, actor: AuthenticatedUser) {
    return this.pickupNumbers.getSettings(locationId, actor);
  }

  updateSettings(
    locationId: string,
    dto: UpdateCounterSettingsDto,
    actor: AuthenticatedUser,
  ) {
    return this.pickupNumbers.updateSettings(locationId, dto, actor);
  }

  private async baseQuery(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<CounterOrderQuery> {
    if (locationId) this.validateObjectId(locationId, 'Standort-ID');
    const query = await this.accessPolicy.getScopedResourceFilter(
      actor,
      locationId,
    );

    query.source = OrderSource.Counter;
    return query;
  }

  private assertCounterOrderRole(actor: AuthenticatedUser): void {
    if (
      hasAnyRole(actor.roles, [
        Role.PlatformAdmin,
        Role.SuperAdmin,
        Role.CompanyAdmin,
        Role.RegionAdmin,
        Role.Admin,
        Role.Regionalleiter,
        Role.Bereichsleiter,
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
        Role.Service,
        Role.Theke,
      ])
    ) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung fuer Thekenbestellungen');
  }

  private assertCanSetStatus(
    actor: AuthenticatedUser,
    status: OrderStatus,
  ): void {
    if (
      hasAnyRole(actor.roles, [
        Role.PlatformAdmin,
        Role.SuperAdmin,
        Role.CompanyAdmin,
        Role.RegionAdmin,
        Role.Admin,
        Role.Regionalleiter,
        Role.Bereichsleiter,
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
      ])
    ) {
      return;
    }

    if (
      [OrderStatus.Accepted, OrderStatus.Preparing, OrderStatus.Ready].includes(
        status,
      ) &&
      hasAnyRole(actor.roles, [Role.Kueche, Role.Bar, Role.Theke])
    ) {
      return;
    }

    if (
      [OrderStatus.Served, OrderStatus.Closed].includes(status) &&
      hasAnyRole(actor.roles, [Role.Service, Role.Theke])
    ) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung fuer diesen Thekenstatus');
  }

  private assertStatusTransition(from: OrderStatus, to: OrderStatus): void {
    const allowed: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.Draft]: [OrderStatus.New, OrderStatus.Cancelled],
      [OrderStatus.New]: [
        OrderStatus.Accepted,
        OrderStatus.Preparing,
        OrderStatus.Cancelled,
      ],
      [OrderStatus.Accepted]: [
        OrderStatus.Preparing,
        OrderStatus.Ready,
        OrderStatus.Cancelled,
      ],
      [OrderStatus.Preparing]: [OrderStatus.Ready, OrderStatus.Cancelled],
      [OrderStatus.Ready]: [
        OrderStatus.Served,
        OrderStatus.Closed,
        OrderStatus.Cancelled,
      ],
      [OrderStatus.Served]: [OrderStatus.Closed],
      [OrderStatus.Closed]: [],
      [OrderStatus.Cancelled]: [],
    };

    if (from === to) return;
    if (!allowed[from]?.includes(to)) {
      throw new BadRequestException(
        `Statuswechsel von ${from} zu ${to} ist nicht erlaubt`,
      );
    }
  }

  private async deductInventoryIfNeeded(
    order: OrderDocument,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (order.inventoryDeducted || order.inventoryConsumedAt) return;
    const result = await this.recipeInventoryService.consumeOrder(
      order,
      actor.sub,
    );

    order.inventoryDeducted = true;
    order.inventoryDeductedAt = new Date();
    order.inventoryConsumedAt = order.inventoryDeductedAt;
    order.inventoryMovementIds = [
      ...(order.inventoryMovementIds ?? []),
      ...result.movementIds,
    ];
    order.inventoryWarnings = this.uniqueValues([
      ...(order.inventoryWarnings ?? []),
      ...result.warnings,
    ]);
    await order.save();
  }

  private async log(
    order: OrderDocument,
    previousStatus: OrderStatus | undefined,
    nextStatus: OrderStatus | undefined,
    action: string,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<void> {
    await this.logModel.create({
      companyId: order.companyId ?? actor.companyId,
      locationId: order.locationId,
      orderId: order._id.toString(),
      pickupNumber: order.pickupNumber,
      previousStatus,
      nextStatus,
      action,
      reason,
      userId: actor.sub,
      userRole: actor.roles?.[0] ?? 'unknown',
    });
  }

  private publish(
    event: string,
    order: OrderDocument,
    actor: AuthenticatedUser,
    extra: Record<string, unknown> = {},
  ): void {
    this.realtimeService.publish(event, {
      order,
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      pickupNumber: order.pickupNumber,
      locationId: order.locationId,
      companyId: order.companyId ?? actor.companyId,
      changedBy: actor.sub,
      changedByRole: actor.roles?.[0] ?? 'unknown',
      channels: this.channels(
        order.companyId ?? actor.companyId,
        order.locationId,
      ),
      ...extra,
    });
  }

  private calculateTotals(items: Pick<OrderItem, 'quantity' | 'price'>[]): {
    subtotal: number;
    tax: number;
    total: number;
  } {
    const subtotal = items.reduce(
      (sum, item) => sum + this.roundMoney(item.quantity * item.price),
      0,
    );

    return {
      subtotal: this.roundMoney(subtotal),
      tax: this.roundMoney(subtotal * 0.19),
      total: this.roundMoney(subtotal),
    };
  }

  private courseTypeFor(category: string): CourseType {
    const normalized = category.toLowerCase();
    if (normalized.includes('getraenk') || normalized.includes('drink'))
      return CourseType.Drink;
    if (normalized.includes('vorspeise') || normalized.includes('starter'))
      return CourseType.Starter;
    if (normalized.includes('dessert')) return CourseType.Dessert;
    return CourseType.Main;
  }

  private dayRange(dateValue: string): { $gte: Date; $lt: Date } {
    const start = new Date(dateValue);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { $gte: start, $lt: end };
  }

  private dateRange(from?: string, to?: string): { $gte: Date; $lt: Date } {
    const start = from ? new Date(from) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = to ? new Date(to) : new Date(start);

    if (to) {
      end.setHours(23, 59, 59, 999);
    } else {
      end.setDate(end.getDate() + 1);
    }

    return { $gte: start, $lt: end };
  }

  private paidAmount(order: OrderDocument): number {
    return this.roundMoney(
      (order.cashAmount ?? 0) +
        (order.cardAmount ?? 0) +
        (order.onlineAmount ?? 0) +
        (order.voucherAmount ?? 0) +
        (order.otherAmount ?? 0),
    );
  }

  private averageWaitMinutes(orders: OrderDocument[]): number {
    if (!orders.length) return 0;
    const now = Date.now();
    const total = orders.reduce((sum, order) => {
      const createdAt = (order as OrderDocument & { createdAt?: Date })
        .createdAt;
      return sum + (createdAt ? now - createdAt.getTime() : 0);
    }, 0);

    return Math.round(total / orders.length / 60000);
  }

  private channels(
    companyId: string | undefined,
    locationId: string,
  ): string[] {
    return [
      ...(companyId ? [`company:${companyId}`] : []),
      `location:${locationId}`,
      `counter:${locationId}`,
      `kitchen:${locationId}`,
      `service:${locationId}`,
    ];
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private uniqueValues(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
