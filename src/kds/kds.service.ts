import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Order,
  OrderDocument,
  OrderItem,
  OrderItemStatus,
  OrderStatus,
  ProductionArea,
} from '../orders/schemas/order.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableStatus,
} from '../tables/schemas/table.schema';
import {
  TableStatusLog,
  TableStatusLogDocument,
} from '../tables/schemas/table-status-log.schema';
import {
  KdsActionDto,
  UpdateOrderItemStatusDto,
  UpdateOrderStatusDto,
} from './dto/kds-status.dto';
import { UpdateKdsSettingsDto } from './dto/update-kds-settings.dto';
import {
  KdsSettings,
  KdsSettingsDocument,
} from './schemas/kds-settings.schema';
import {
  KdsStatusLog,
  KdsStatusLogDocument,
} from './schemas/kds-status-log.schema';

export interface KdsOrderFilters {
  locationId?: string;
  area?: ProductionArea | 'Alle';
  status?: OrderStatus;
}

const ACTIVE_STATUSES = [
  OrderStatus.New,
  OrderStatus.Accepted,
  OrderStatus.Preparing,
  OrderStatus.Ready,
];

const STATUS_TRANSITIONS = new Map<OrderStatus, OrderStatus[]>([
  [OrderStatus.New, [OrderStatus.Accepted, OrderStatus.Cancelled]],
  [OrderStatus.Accepted, [OrderStatus.Preparing, OrderStatus.Cancelled]],
  [OrderStatus.Preparing, [OrderStatus.Ready, OrderStatus.Cancelled]],
  [OrderStatus.Ready, [OrderStatus.Served, OrderStatus.Cancelled]],
  [OrderStatus.Served, []],
  [OrderStatus.Cancelled, []],
]);

@Injectable()
export class KdsService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    @InjectModel(TableStatusLog.name)
    private readonly tableStatusLogModel: Model<TableStatusLogDocument>,
    @InjectModel(KdsStatusLog.name)
    private readonly logModel: Model<KdsStatusLogDocument>,
    @InjectModel(KdsSettings.name)
    private readonly settingsModel: Model<KdsSettingsDocument>,
    private readonly realtimeService: RealtimeService,
    private readonly recipeInventoryService: RecipeInventoryService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async findOrders(
    actor: AuthenticatedUser,
    filters: KdsOrderFilters = {},
  ): Promise<OrderDocument[]> {
    const query = await this.accessPolicy.getScopedResourceFilter(
      actor,
      filters.locationId,
    );

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.area && filters.area !== 'Alle') {
      query['items.productionArea'] = filters.area;
    }

    return this.orderModel.find(query).sort({ createdAt: 1 }).exec();
  }

  async findActive(
    actor: AuthenticatedUser,
    filters: KdsOrderFilters = {},
  ): Promise<OrderDocument[]> {
    return this.findOrders(actor, {
      ...filters,
      status: undefined,
    }).then((orders) =>
      orders.filter((order) => ACTIVE_STATUSES.includes(order.status)),
    );
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');
    const order = await this.orderModel.findById(id).exec();

    if (
      !order ||
      !(await this.accessPolicy.canAccessLocation(actor, order.locationId))
    ) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    return order;
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const order = await this.findOne(id, actor);
    this.assertTransition(order.status, dto.status);

    const previousStatus = order.status;
    const now = new Date();
    order.status = dto.status;
    order.statusTimestamps = {
      ...(order.statusTimestamps ?? {}),
      [dto.status]: now,
    };

    if (dto.status === OrderStatus.Ready) {
      order.calledAt = undefined;
      this.markOpenItems(order, OrderItemStatus.Ready);
    }

    if (dto.status === OrderStatus.Served) {
      order.completedAt = now;
      this.markOpenItems(order, OrderItemStatus.Served);
    }

    if (dto.status === OrderStatus.Cancelled) {
      order.cancelledAt = now;
      this.markOpenItems(order, OrderItemStatus.Cancelled);
    }

    const saved = await order.save();
    if (
      dto.status === OrderStatus.Accepted &&
      !this.hasInventoryDeduction(saved)
    ) {
      await this.deductOrderInventory(saved, actor.sub);
    }
    if (
      dto.status === OrderStatus.Cancelled &&
      this.hasInventoryDeduction(saved) &&
      !saved.inventoryReversedAt
    ) {
      await this.reverseOrderInventory(saved, actor.sub);
    }
    await this.syncTableStatus(saved, actor, 'table.status.changed');
    await this.writeLog(saved, 'order.statusChanged', actor, {
      fromStatus: previousStatus,
      toStatus: dto.status,
      comment: dto.comment,
      employeeName: dto.employeeName,
    });

    this.realtimeService.publish('order.statusChanged', saved);

    if (dto.status === OrderStatus.Ready) {
      this.realtimeService.publish('order.readyForPickup', saved);
    }

    if (dto.status === OrderStatus.Served) {
      this.realtimeService.publish('order.completed', saved);
    }

    if (dto.status === OrderStatus.Cancelled) {
      this.realtimeService.publish('order.cancelled', saved);
    }

    return saved;
  }

  async updateItemStatus(
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemStatusDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const order = await this.findOne(orderId, actor);
    const item = order.items.find((entry) => entry._id?.toString() === itemId);

    if (!item) {
      throw new NotFoundException('Bestellposition nicht gefunden');
    }

    const previousStatus = item.status;
    const changedAt = new Date();
    item.status = dto.status;
    item.changedAt = changedAt;
    this.applyItemStatusAuditFields(item, dto.status, actor.sub, changedAt);
    const previousOrderStatus = order.status;
    order.status = this.aggregateOrderStatus(order);
    order.statusTimestamps = {
      ...(order.statusTimestamps ?? {}),
      [order.status]: changedAt,
    };

    const saved = await order.save();
    await this.syncTableStatus(saved, actor, 'table.status.changed');
    await this.writeLog(saved, 'order.item.status.changed', actor, {
      itemId,
      fromStatus: previousStatus,
      toStatus: dto.status,
      comment: dto.note ?? dto.comment,
      employeeName: dto.employeeName,
    });

    const payload = {
      companyId: saved.companyId ?? actor.companyId,
      locationId: saved.locationId,
      orderId: saved._id.toString(),
      orderNumber: saved.orderNumber,
      itemId,
      itemName: item.name,
      previousStatus,
      newStatus: dto.status,
      changedBy: actor.sub,
      changedByRole: actor.roles?.[0] ?? 'unknown',
      changedAt: changedAt.toISOString(),
      orderStatus: saved.status,
      order: saved,
      channels: this.eventChannels(
        saved.companyId ?? actor.companyId,
        saved.locationId,
      ),
    };

    this.realtimeService.publish('order.item.status.changed', payload);
    this.realtimeService.publish('order.itemUpdated', saved);

    if (previousOrderStatus !== saved.status) {
      this.realtimeService.publish('order.status.changed', {
        companyId: saved.companyId ?? actor.companyId,
        locationId: saved.locationId,
        orderId: saved._id.toString(),
        previousStatus: previousOrderStatus,
        newStatus: saved.status,
        changedBy: actor.sub,
        changedByRole: actor.roles?.[0] ?? 'unknown',
        changedAt: changedAt.toISOString(),
        order: saved,
        channels: this.eventChannels(
          saved.companyId ?? actor.companyId,
          saved.locationId,
        ),
      });
    }

    return saved;
  }

  async callOrder(
    id: string,
    dto: KdsActionDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const order = await this.findOne(id, actor);

    if (order.status !== OrderStatus.Ready) {
      throw new BadRequestException(
        'Nur abholbereite Bestellungen koennen aufgerufen werden',
      );
    }

    order.calledAt = new Date();
    const saved = await order.save();
    await this.writeLog(saved, 'order.called', actor, {
      comment: dto.comment,
      employeeName: dto.employeeName,
    });
    this.realtimeService.publish('order.called', saved);

    return saved;
  }

  completeOrder(id: string, dto: KdsActionDto, actor: AuthenticatedUser) {
    return this.updateStatus(id, { ...dto, status: OrderStatus.Served }, actor);
  }

  cancelOrder(id: string, dto: KdsActionDto, actor: AuthenticatedUser) {
    return this.updateStatus(
      id,
      { ...dto, status: OrderStatus.Cancelled },
      actor,
    );
  }

  async getSettings(
    locationId: string,
    actor: AuthenticatedUser,
  ): Promise<KdsSettingsDocument> {
    this.validateObjectId(locationId, 'Standort-ID');
    await this.accessPolicy.assertCanAccessLocation(actor, locationId);

    return this.settingsModel
      .findOneAndUpdate(
        { locationId },
        { $setOnInsert: { locationId } },
        { new: true, upsert: true, runValidators: true },
      )
      .exec();
  }

  async updateSettings(
    locationId: string,
    dto: UpdateKdsSettingsDto,
    actor: AuthenticatedUser,
  ): Promise<KdsSettingsDocument> {
    await this.accessPolicy.assertCanManageLocation(actor, locationId);
    await this.getSettings(locationId, actor);

    return this.settingsModel
      .findOneAndUpdate({ locationId }, dto, {
        new: true,
        runValidators: true,
      })
      .exec()
      .then((settings) => {
        if (!settings) {
          throw new NotFoundException('KDS-Einstellungen nicht gefunden');
        }

        this.realtimeService.publish('order.updated', { settings });

        return settings;
      });
  }

  async findHistory(
    actor: AuthenticatedUser,
    filters: {
      locationId?: string;
      orderId?: string;
    } = {},
  ): Promise<KdsStatusLogDocument[]> {
    const query = await this.accessPolicy.getScopedResourceFilter(
      actor,
      filters.locationId,
    );

    if (filters.orderId) {
      this.validateObjectId(filters.orderId, 'Bestell-ID');
      query.orderId = filters.orderId;
    }

    return this.logModel.find(query).sort({ createdAt: -1 }).limit(250).exec();
  }

  async pickupDisplay(actor: AuthenticatedUser, locationId?: string) {
    const activeOrders = await this.findActive(actor, { locationId });
    const calledFilter = await this.accessPolicy.getScopedResourceFilter(
      actor,
      locationId,
    );
    const called = await this.orderModel
      .find({
        ...calledFilter,
        calledAt: { $exists: true },
      })
      .sort({ calledAt: -1 })
      .limit(8)
      .exec();

    return {
      preparing: activeOrders.filter((order) =>
        [OrderStatus.New, OrderStatus.Accepted, OrderStatus.Preparing].includes(
          order.status,
        ),
      ),
      ready: activeOrders.filter((order) => order.status === OrderStatus.Ready),
      recentlyCalled: called,
    };
  }

  private assertTransition(
    fromStatus: OrderStatus,
    toStatus: OrderStatus,
  ): void {
    if (fromStatus === toStatus) {
      return;
    }

    if (!STATUS_TRANSITIONS.get(fromStatus)?.includes(toStatus)) {
      throw new BadRequestException(
        `Statuswechsel von ${fromStatus} zu ${toStatus} ist nicht erlaubt`,
      );
    }
  }

  private markOpenItems(order: OrderDocument, status: OrderItemStatus): void {
    order.items.forEach((item) => {
      if (
        ![OrderItemStatus.Served, OrderItemStatus.Cancelled].includes(
          item.status ?? OrderItemStatus.Open,
        )
      ) {
        item.status = status;
        item.changedAt = new Date();
      }
    });
  }

  private hasInventoryDeduction(order: OrderDocument): boolean {
    return Boolean(order.inventoryDeducted || order.inventoryConsumedAt);
  }

  private async deductOrderInventory(
    order: OrderDocument,
    actorId: string,
  ): Promise<void> {
    const result = await this.recipeInventoryService.consumeOrder(
      order,
      actorId,
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

  private async reverseOrderInventory(
    order: OrderDocument,
    actorId: string,
  ): Promise<void> {
    const result = await this.recipeInventoryService.reverseOrder(
      order,
      actorId,
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
    await order.save();
  }

  private uniqueValues(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }

  private aggregateOrderStatus(order: OrderDocument): OrderStatus {
    const statuses = order.items.map(
      (item) => item.status ?? OrderItemStatus.Open,
    );

    if (!statuses.length) {
      return order.status;
    }

    const activeStatuses = statuses.filter(
      (status) => status !== OrderItemStatus.Cancelled,
    );

    if (!activeStatuses.length) {
      return OrderStatus.Cancelled;
    }

    if (activeStatuses.every((status) => status === OrderItemStatus.Served)) {
      return OrderStatus.Served;
    }

    if (
      activeStatuses.every((status) =>
        [OrderItemStatus.Ready, OrderItemStatus.Served].includes(status),
      )
    ) {
      return OrderStatus.Ready;
    }

    if (
      activeStatuses.some((status) =>
        [
          OrderItemStatus.Started,
          OrderItemStatus.Preparing,
          OrderItemStatus.Ready,
          OrderItemStatus.Served,
        ].includes(status),
      )
    ) {
      return OrderStatus.Preparing;
    }

    return OrderStatus.New;
  }

  private applyItemStatusAuditFields(
    item: OrderItem,
    status: OrderItemStatus,
    actorId: string,
    changedAt: Date,
  ): void {
    if (status === OrderItemStatus.Started) {
      item.startedAt = changedAt;
      item.startedBy = actorId;
    }
    if (status === OrderItemStatus.Preparing) {
      item.inPreparationAt = changedAt;
      item.inPreparationBy = actorId;
    }
    if (status === OrderItemStatus.Ready) {
      item.readyAt = changedAt;
      item.readyBy = actorId;
    }
    if (status === OrderItemStatus.Served) {
      item.servedAt = changedAt;
      item.servedBy = actorId;
    }
    if (status === OrderItemStatus.Cancelled) {
      item.cancelledAt = changedAt;
      item.cancelledBy = actorId;
    }
  }

  private async syncTableStatus(
    order: OrderDocument,
    actor: AuthenticatedUser,
    eventName: string,
  ): Promise<void> {
    if (!order.tableId) {
      return;
    }

    const table = await this.tableModel.findById(order.tableId).exec();

    if (!table) {
      return;
    }

    const activeOrders = await this.orderModel
      .find({
        tableId: order.tableId,
        status: { $nin: [OrderStatus.Cancelled, OrderStatus.Closed] },
      })
      .sort({ createdAt: 1 })
      .exec();
    const status = this.getTableStatusForOrders(activeOrders, order);
    const changedAt = new Date();

    const updatedTable = await this.tableModel
      .findByIdAndUpdate(
        order.tableId,
        {
          status,
          activeOrderIds: activeOrders.map((activeOrder) =>
            activeOrder._id.toString(),
          ),
          currentTotal: this.roundMoney(
            activeOrders.reduce(
              (sum, activeOrder) => sum + (activeOrder.total ?? 0),
              0,
            ),
          ),
          guestCount: activeOrders.reduce(
            (sum, activeOrder) => sum + (activeOrder.guestCount ?? 0),
            0,
          ),
          waitingSince: this.getTableWaitingSince(activeOrders),
          assignedWaiterId:
            activeOrders.find((activeOrder) => activeOrder.assignedWaiterId)
              ?.assignedWaiterId ?? undefined,
          lastStatusChange: changedAt,
        },
        { new: true },
      )
      .exec();

    if (!updatedTable) {
      return;
    }

    if (table.status !== status) {
      await this.tableStatusLogModel.create({
        companyId: updatedTable.companyId ?? actor.companyId,
        regionId: updatedTable.regionId,
        locationId: updatedTable.locationId,
        tableId: updatedTable._id.toString(),
        tableName: updatedTable.tableName ?? updatedTable.name,
        previousStatus: table.status,
        nextStatus: status,
        orderId: order._id.toString(),
        userId: actor.sub,
        userRole: actor.roles?.[0] ?? 'unknown',
        reason: eventName,
        changedAt,
      });
    }

    this.publishTableStatusEvent(
      eventName,
      updatedTable,
      table.status,
      status,
      actor,
      order,
      changedAt,
    );

    if (eventName !== 'table.status.changed') {
      this.publishTableStatusEvent(
        'table.status.changed',
        updatedTable,
        table.status,
        status,
        actor,
        order,
        changedAt,
      );
    }

    const mappedEvent = this.getTableEventForOrderStatus(order.status);
    if (mappedEvent) {
      this.publishTableStatusEvent(
        mappedEvent,
        updatedTable,
        table.status,
        status,
        actor,
        order,
        changedAt,
      );
    }
  }

  private getTableStatusForOrders(
    activeOrders: OrderDocument[],
    fallbackOrder: OrderDocument,
  ): TableStatus {
    if (!activeOrders.length) {
      return fallbackOrder.status === OrderStatus.Cancelled
        ? TableStatus.Free
        : TableStatus.Paid;
    }

    if (activeOrders.some((order) => order.status === OrderStatus.Served)) {
      return TableStatus.Served;
    }
    if (activeOrders.some((order) => order.status === OrderStatus.Ready)) {
      return TableStatus.ReadyToServe;
    }
    if (activeOrders.some((order) => order.status === OrderStatus.Preparing)) {
      return TableStatus.InPreparation;
    }
    if (activeOrders.some((order) => order.status === OrderStatus.Accepted)) {
      return TableStatus.OrderSent;
    }

    return TableStatus.Ordering;
  }

  private getTableWaitingSince(
    activeOrders: OrderDocument[],
  ): Date | undefined {
    const timestamps = activeOrders
      .map(
        (order) =>
          order.statusTimestamps?.[OrderStatus.Accepted] ??
          order.statusTimestamps?.[OrderStatus.Preparing] ??
          order.statusTimestamps?.[OrderStatus.New] ??
          (order as OrderDocument & { createdAt?: Date }).createdAt,
      )
      .filter((value): value is Date => Boolean(value))
      .sort((first, second) => first.getTime() - second.getTime());

    return timestamps[0];
  }

  private getTableEventForOrderStatus(status: OrderStatus): string | null {
    if (status === OrderStatus.Accepted) {
      return 'table.order.sent';
    }
    if (status === OrderStatus.Ready) {
      return 'table.order.ready';
    }
    if (status === OrderStatus.Closed) {
      return 'table.paid';
    }

    return null;
  }

  private publishTableStatusEvent(
    event: string,
    table: RestaurantTableDocument,
    previousStatus: TableStatus,
    status: TableStatus,
    actor: AuthenticatedUser,
    order: OrderDocument,
    changedAt: Date,
  ): void {
    this.realtimeService.publish(event, {
      tableId: table._id.toString(),
      tableName: table.tableName ?? table.name,
      locationId: table.locationId,
      companyId: table.companyId ?? actor.companyId,
      regionId: table.regionId,
      previousStatus,
      status,
      orderId: order._id.toString(),
      orderStatus: order.status,
      guestCount: table.guestCount ?? 0,
      activeOrderIds: table.activeOrderIds ?? [],
      currentTotal: table.currentTotal ?? 0,
      waitingSince: table.waitingSince,
      lastStatusChange: table.lastStatusChange,
      changedBy: actor.sub,
      changedByRole: actor.roles?.[0] ?? 'unknown',
      changedAt,
      channels: this.eventChannels(
        table.companyId ?? actor.companyId,
        table.locationId,
      ),
    });
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async writeLog(
    order: OrderDocument,
    action: string,
    actor: AuthenticatedUser,
    options: {
      itemId?: string;
      fromStatus?: string;
      toStatus?: string;
      employeeName?: string;
      comment?: string;
    } = {},
  ): Promise<void> {
    await this.logModel.create({
      companyId: order.companyId ?? actor.companyId,
      locationId: order.locationId,
      orderId: order._id.toString(),
      itemId: options.itemId,
      action,
      fromStatus: options.fromStatus,
      toStatus: options.toStatus,
      employeeId: actor.sub,
      employeeName: options.employeeName ?? actor.email,
      employeeRole: actor.roles?.[0],
      comment: options.comment,
    });
  }

  private eventChannels(
    companyId: string | undefined,
    locationId: string,
  ): string[] {
    return [
      ...(companyId ? [`company:${companyId}`] : []),
      `location:${locationId}`,
      `kitchen:${locationId}`,
      `service:${locationId}`,
    ];
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
