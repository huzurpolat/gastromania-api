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
  KdsStatusLog,
  KdsStatusLogDocument,
} from '../kds/schemas/kds-status-log.schema';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableStatus,
} from '../tables/schemas/table.schema';
import {
  TableStatusLog,
  TableStatusLogDocument,
} from '../tables/schemas/table-status-log.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderItemStatusDto } from './dto/update-order-item-status.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import {
  CourseType,
  Order,
  OrderDocument,
  OrderItem,
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
  ProductionArea,
} from './schemas/order.schema';

export interface OrderFilters {
  locationId?: string;
  tableId?: string;
  status?: string;
  date?: Date;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    @InjectModel(TableStatusLog.name)
    private readonly tableStatusLogModel: Model<TableStatusLogDocument>,
    @InjectModel(KdsStatusLog.name)
    private readonly logModel: Model<KdsStatusLogDocument>,
    private readonly realtimeService: RealtimeService,
    private readonly recipeInventoryService: RecipeInventoryService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    this.validateObjectId(createOrderDto.locationId, 'Standort-ID');
    await this.accessPolicy.assertCanAccessLocation(actor, createOrderDto.locationId);
    if (createOrderDto.tableId) {
      this.validateObjectId(createOrderDto.tableId, 'Tisch-ID');
    }

    const status = createOrderDto.status ?? OrderStatus.New;
    const totals = this.calculateTotals(createOrderDto.items);
    const order = await this.orderModel.create({
      ...createOrderDto,
      companyId: actor.companyId,
      createdBy: actor.sub,
      employeeId: createOrderDto.employeeId ?? actor.sub,
      assignedWaiterId: createOrderDto.assignedWaiterId ?? actor.sub,
      guestCount: createOrderDto.guestCount ?? 1,
      orderNumber: await this.nextOrderNumber(createOrderDto.locationId),
      pickupNumber:
        createOrderDto.tableId || createOrderDto.customerNumber
          ? createOrderDto.customerNumber
          : await this.nextPickupNumber(createOrderDto.locationId),
      status,
      statusTimestamps: {
        [status]: new Date(),
      },
      items: createOrderDto.items.map((item) => ({
        ...item,
        totalPrice: this.calculateItemTotal(item),
        status: item.status ?? OrderItemStatus.Open,
        productionArea:
          item.productionArea ??
          (item.isKitchenItem === false
            ? ProductionArea.Bar
            : ProductionArea.Kitchen),
        courseType: item.courseType ?? CourseType.Main,
        specialRequests: item.specialRequests ?? [],
        allergens: item.allergens ?? [],
      })),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    });

    try {
      await this.recipeInventoryService.consumeOrder(
        order,
        actor.sub,
      );
      order.inventoryConsumedAt = new Date();
      await order.save();
    } catch (error) {
      await order.deleteOne();
      throw error;
    }

    this.realtimeService.publish('order.created', order);
    await this.syncTableStatus(order, false, actor, 'table.order.created');

    return order;
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: OrderFilters = {},
  ): Promise<OrderDocument[]> {
    const query = await this.accessPolicy.getScopedResourceFilter(
      actor,
      filters.locationId,
    );

    if (filters.locationId) {
      this.validateObjectId(filters.locationId, 'Standort-ID');
    }

    if (filters.tableId) {
      this.validateObjectId(filters.tableId, 'Tisch-ID');
      query.tableId = filters.tableId;
    }

    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      query.createdAt = { $gte: start, $lt: end };
    }

    return this.orderModel.find(query).sort({ createdAt: -1 }).exec();
  }

  findByLocation(
    actor: AuthenticatedUser,
    locationId: string,
  ): Promise<OrderDocument[]> {
    return this.findAll(actor, { locationId });
  }

  findToday(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<OrderDocument[]> {
    return this.findAll(actor, { locationId, date: new Date() });
  }

  async findOne(id: string, actor?: AuthenticatedUser): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');

    const order = await this.orderModel.findById(id).exec();

    if (
      !order ||
      (actor && !(await this.accessPolicy.canAccessLocation(actor, order.locationId)))
    ) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    return order;
  }

  async update(
    id: string,
    updateOrderDto: UpdateOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');
    const currentOrder = await this.findOne(id, actor);
    await this.accessPolicy.assertCanAccessLocation(actor, currentOrder.locationId);

    if (updateOrderDto.locationId) {
      this.validateObjectId(updateOrderDto.locationId, 'Standort-ID');
      await this.accessPolicy.assertCanAccessLocation(actor, updateOrderDto.locationId);
    }

    if (updateOrderDto.tableId) {
      this.validateObjectId(updateOrderDto.tableId, 'Tisch-ID');
    }

    const totals = updateOrderDto.items
      ? this.calculateTotals(updateOrderDto.items)
      : undefined;
    const updatePayload = {
      ...updateOrderDto,
      ...(updateOrderDto.items
        ? {
            items: updateOrderDto.items.map((item) => ({
              ...item,
              totalPrice: this.calculateItemTotal(item),
              status: item.status ?? OrderItemStatus.Open,
              productionArea:
                item.productionArea ??
                (item.isKitchenItem === false
                  ? ProductionArea.Bar
                  : ProductionArea.Kitchen),
              courseType: item.courseType ?? CourseType.Main,
              specialRequests: item.specialRequests ?? [],
              allergens: item.allergens ?? [],
            })),
            subtotal: totals?.subtotal,
            tax: totals?.tax,
            total: totals?.total,
          }
        : {}),
    };

    const statusChanged =
      updateOrderDto.status && updateOrderDto.status !== currentOrder.status;
    const statusTimestamps = statusChanged
      ? {
          ...(currentOrder.statusTimestamps ?? {}),
          [updateOrderDto.status as string]: new Date(),
        }
      : currentOrder.statusTimestamps;

    const updatedOrder = await this.orderModel
      .findByIdAndUpdate(
        id,
        { ...updatePayload, statusTimestamps },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!updatedOrder) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    if (
      updatedOrder.status === OrderStatus.Cancelled &&
      updatedOrder.inventoryConsumedAt &&
      !updatedOrder.inventoryReversedAt
    ) {
      await this.recipeInventoryService.reverseOrder(updatedOrder, actor.sub);
      updatedOrder.inventoryReversedAt = new Date();
      await updatedOrder.save();
    }

    this.realtimeService.publish(
      statusChanged ? 'order.statusChanged' : 'order.updated',
      updatedOrder,
    );
    await this.syncTableStatus(
      updatedOrder,
      false,
      actor,
      this.getPrimaryTableEventForOrderUpdate(
        updatedOrder.status,
        updatedOrder.paymentStatus,
        Boolean(statusChanged),
      ),
    );

    return updatedOrder;
  }

  async sendToKitchen(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    return this.update(id, { status: OrderStatus.Accepted }, actor);
  }

  async markPaid(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    return this.update(
      id,
      { paymentStatus: PaymentStatus.Paid, status: OrderStatus.Closed },
      actor,
    );
  }

  async close(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    return this.update(id, { status: OrderStatus.Closed }, actor);
  }

  async releaseTable(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const order = await this.findOne(id, actor);

    if (!order.tableId) {
      throw new BadRequestException('Bestellung ist keinem Tisch zugeordnet');
    }

    const released = await this.update(
      id,
      { paymentStatus: PaymentStatus.Paid, status: OrderStatus.Closed },
      actor,
    );

    await this.syncTableStatus(released, true, actor, 'table.cleaned');

    return released;
  }

  async updateItemStatus(
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemStatusDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const order = await this.findOne(orderId, actor);
    await this.accessPolicy.assertCanAccessLocation(actor, order.locationId);
    this.assertCanSetItemStatus(actor, dto.status);

    const item = order.items.find((entry) => entry._id?.toString() === itemId);

    if (!item) {
      throw new NotFoundException('Bestellposition nicht gefunden');
    }

    const previousStatus = item.status ?? OrderItemStatus.Open;
    const changedAt = new Date();
    const changedByRole = this.primaryRole(actor);
    const note = dto.note ?? dto.comment;

    item.status = dto.status;
    item.changedAt = changedAt;
    this.applyItemStatusAuditFields(item, dto.status, actor.sub, changedAt);

    const previousOrderStatus = order.status;
    const nextOrderStatus = this.aggregateOrderStatus(order);
    order.status = nextOrderStatus;
    order.statusTimestamps = {
      ...(order.statusTimestamps ?? {}),
      [nextOrderStatus]: changedAt,
    };

    if (nextOrderStatus === OrderStatus.Ready) {
      order.calledAt = undefined;
    }
    if (nextOrderStatus === OrderStatus.Served) {
      order.completedAt = changedAt;
    }
    if (nextOrderStatus === OrderStatus.Cancelled) {
      order.cancelledAt = changedAt;
    }

    const saved = await order.save();
    await this.syncTableStatus(saved, false, actor, 'table.status.changed');
    await this.writeItemStatusLog(saved, itemId, previousStatus, dto.status, actor, note);

    const eventPayload = {
      companyId: saved.companyId ?? actor.companyId,
      locationId: saved.locationId,
      orderId: saved._id.toString(),
      orderNumber: saved.orderNumber,
      itemId,
      itemName: item.name,
      previousStatus,
      newStatus: dto.status,
      changedBy: actor.sub,
      changedByRole,
      changedAt: changedAt.toISOString(),
      orderStatus: saved.status,
      order: saved,
      channels: this.eventChannels(saved.companyId ?? actor.companyId, saved.locationId),
    };

    this.realtimeService.publish('order.item.status.changed', eventPayload);

    if (previousOrderStatus !== saved.status) {
      this.realtimeService.publish('order.status.changed', {
        companyId: saved.companyId ?? actor.companyId,
        locationId: saved.locationId,
        orderId: saved._id.toString(),
        previousStatus: previousOrderStatus,
        newStatus: saved.status,
        changedBy: actor.sub,
        changedByRole,
        changedAt: changedAt.toISOString(),
        order: saved,
        channels: this.eventChannels(saved.companyId ?? actor.companyId, saved.locationId),
      });
    }

    return saved;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');
    const order = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, order.locationId);

    if (order.inventoryConsumedAt && !order.inventoryReversedAt) {
      await this.recipeInventoryService.reverseOrder(order, actor.sub);
      order.inventoryReversedAt = new Date();
      await order.save();
    }

    const deletedOrder = await this.orderModel.findByIdAndDelete(id).exec();

    if (!deletedOrder) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    this.realtimeService.publish('order.cancelled', deletedOrder);
    await this.syncTableStatus(deletedOrder, true, actor, 'table.status.changed');

    return deletedOrder;
  }

  private calculateTotals(
    items: Pick<OrderItem, 'quantity' | 'price'>[],
  ): { subtotal: number; tax: number; total: number } {
    const subtotal = items.reduce(
      (sum, item) => sum + this.calculateItemTotal(item),
      0,
    );
    const tax = this.roundMoney(subtotal * 0.19);

    return {
      subtotal: this.roundMoney(subtotal),
      tax,
      total: this.roundMoney(subtotal),
    };
  }

  private calculateItemTotal(
    item: Pick<OrderItem, 'quantity' | 'price'>,
  ): number {
    return this.roundMoney(item.quantity * item.price);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async syncTableStatus(
    order: Pick<
      OrderDocument,
      | '_id'
      | 'tableId'
      | 'status'
      | 'paymentStatus'
      | 'locationId'
      | 'companyId'
      | 'guestCount'
      | 'total'
      | 'assignedWaiterId'
      | 'statusTimestamps'
    >,
    removed = false,
    actor?: AuthenticatedUser,
    eventName = 'table.status.changed',
  ): Promise<void> {
    if (!order.tableId) {
      return;
    }

    const table = await this.tableModel.findById(order.tableId).exec();

    if (!table) {
      return;
    }

    const activeOrders = await this.getActiveOrdersForTable(order.tableId);
    const status = this.getTableStatusForOrders(activeOrders, order, removed);
    const activeOrderIds = activeOrders.map((activeOrder) => activeOrder._id.toString());
    const currentTotal = activeOrders.reduce(
      (sum, activeOrder) => sum + (activeOrder.total ?? 0),
      0,
    );
    const guestCount = activeOrders.reduce(
      (sum, activeOrder) => sum + (activeOrder.guestCount ?? 0),
      0,
    );
    const waitingSince = this.getTableWaitingSince(activeOrders);
    const assignedWaiterId =
      activeOrders.find((activeOrder) => activeOrder.assignedWaiterId)?.assignedWaiterId ??
      undefined;
    const changedAt = new Date();

    const updatedTable = await this.tableModel
      .findByIdAndUpdate(
        order.tableId,
        {
          status,
          activeOrderIds,
          currentTotal: this.roundMoney(currentTotal),
          guestCount,
          waitingSince,
          assignedWaiterId,
          lastStatusChange: changedAt,
        },
        { new: true },
      )
      .exec();

    if (!updatedTable) {
      return;
    }

    if (table.status !== status) {
      await this.writeTableStatusLog(updatedTable, table.status, status, actor, {
        orderId: order._id?.toString(),
        reason: eventName,
        changedAt,
      });
    }

    this.publishTableStatusEvent(eventName, updatedTable, table.status, status, actor, {
      orderId: order._id?.toString(),
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      changedAt,
    });

    if (eventName !== 'table.status.changed') {
      this.publishTableStatusEvent(
        'table.status.changed',
        updatedTable,
        table.status,
        status,
        actor,
        {
          orderId: order._id?.toString(),
          orderStatus: order.status,
          paymentStatus: order.paymentStatus,
          changedAt,
        },
      );
    }

    const mappedEvent = this.getTableEventForOrderStatus(order.status, order.paymentStatus);
    if (mappedEvent && mappedEvent !== eventName) {
      this.publishTableStatusEvent(mappedEvent, updatedTable, table.status, status, actor, {
        orderId: order._id?.toString(),
        orderStatus: order.status,
        paymentStatus: order.paymentStatus,
        changedAt,
      });
    }
  }

  private getTableStatusForOrder(
    status: OrderStatus,
    paymentStatus?: PaymentStatus,
  ): TableStatus {
    if (paymentStatus === PaymentStatus.Paid) {
      return TableStatus.Paid;
    }

    switch (status) {
      case OrderStatus.Draft:
      case OrderStatus.New:
        return TableStatus.Ordering;
      case OrderStatus.Accepted:
        return TableStatus.OrderSent;
      case OrderStatus.Preparing:
        return TableStatus.InPreparation;
      case OrderStatus.Ready:
        return TableStatus.ReadyToServe;
      case OrderStatus.Served:
        return TableStatus.Served;
      case OrderStatus.Closed:
        return TableStatus.Paid;
      case OrderStatus.Cancelled:
        return TableStatus.Free;
    }
  }

  private async getActiveOrdersForTable(tableId: string): Promise<OrderDocument[]> {
    return this.orderModel
      .find({
        tableId,
        status: { $nin: [OrderStatus.Cancelled, OrderStatus.Closed] },
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  private getTableStatusForOrders(
    activeOrders: OrderDocument[],
    fallbackOrder: Pick<OrderDocument, 'status' | 'paymentStatus'>,
    removed: boolean,
  ): TableStatus {
    if (removed || !activeOrders.length) {
      if (removed) {
        return TableStatus.Free;
      }

      return fallbackOrder.paymentStatus === PaymentStatus.Paid
        ? TableStatus.Paid
        : TableStatus.Free;
    }

    if (activeOrders.some((order) => order.paymentStatus === PaymentStatus.Paid)) {
      return TableStatus.Paid;
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
    if (activeOrders.some((order) => [OrderStatus.Draft, OrderStatus.New].includes(order.status))) {
      return TableStatus.Ordering;
    }

    return this.getTableStatusForOrder(fallbackOrder.status, fallbackOrder.paymentStatus);
  }

  private getTableWaitingSince(activeOrders: OrderDocument[]): Date | undefined {
    const timestamps = activeOrders
      .map((order) =>
        order.statusTimestamps?.[OrderStatus.Accepted] ??
        order.statusTimestamps?.[OrderStatus.Preparing] ??
        order.statusTimestamps?.[OrderStatus.New] ??
        (order as OrderDocument & { createdAt?: Date }).createdAt,
      )
      .filter((value): value is Date => Boolean(value))
      .sort((first, second) => first.getTime() - second.getTime());

    return timestamps[0];
  }

  private getTableEventForOrderStatus(
    status: OrderStatus,
    paymentStatus?: PaymentStatus,
  ): string | null {
    if (paymentStatus === PaymentStatus.Paid || status === OrderStatus.Closed) {
      return 'table.paid';
    }

    if (status === OrderStatus.Accepted) {
      return 'table.order.sent';
    }

    if (status === OrderStatus.Ready) {
      return 'table.order.ready';
    }

    if ([OrderStatus.Draft, OrderStatus.New].includes(status)) {
      return 'table.order.created';
    }

    return null;
  }

  private getPrimaryTableEventForOrderUpdate(
    status: OrderStatus,
    paymentStatus: PaymentStatus | undefined,
    statusChanged: boolean,
  ): string {
    if (!statusChanged) {
      return 'table.status.changed';
    }

    return this.getTableEventForOrderStatus(status, paymentStatus) ?? 'table.status.changed';
  }

  private async writeTableStatusLog(
    table: RestaurantTableDocument,
    previousStatus: TableStatus,
    nextStatus: TableStatus,
    actor: AuthenticatedUser | undefined,
    options: { orderId?: string; reason?: string; changedAt?: Date } = {},
  ): Promise<void> {
    await this.tableStatusLogModel.create({
      companyId: table.companyId ?? actor?.companyId,
      regionId: table.regionId,
      locationId: table.locationId,
      tableId: table._id.toString(),
      tableName: table.tableName ?? table.name,
      previousStatus,
      nextStatus,
      orderId: options.orderId,
      userId: actor?.sub,
      userRole: actor ? this.primaryRole(actor) : 'system',
      reason: options.reason,
      changedAt: options.changedAt ?? new Date(),
    });
  }

  private publishTableStatusEvent(
    event: string,
    table: RestaurantTableDocument,
    previousStatus: TableStatus,
    status: TableStatus,
    actor: AuthenticatedUser | undefined,
    metadata: Record<string, unknown>,
  ): void {
    this.realtimeService.publish(event, {
      tableId: table._id.toString(),
      tableName: table.tableName ?? table.name,
      locationId: table.locationId,
      companyId: table.companyId ?? actor?.companyId,
      regionId: table.regionId,
      previousStatus,
      status,
      guestCount: table.guestCount ?? 0,
      activeOrderIds: table.activeOrderIds ?? [],
      currentTotal: table.currentTotal ?? 0,
      waitingSince: table.waitingSince,
      lastStatusChange: table.lastStatusChange,
      changedBy: actor?.sub,
      changedByRole: actor ? this.primaryRole(actor) : 'system',
      channels: this.eventChannels(table.companyId ?? actor?.companyId, table.locationId),
      ...metadata,
    });
  }

  private aggregateOrderStatus(order: OrderDocument): OrderStatus {
    const statuses = order.items.map((item) => item.status ?? OrderItemStatus.Open);

    if (!statuses.length) {
      return order.status;
    }

    const activeStatuses = statuses.filter((status) => status !== OrderItemStatus.Cancelled);

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

    if (activeStatuses.some((status) => status === OrderItemStatus.Preparing)) {
      return OrderStatus.Preparing;
    }

    if (activeStatuses.some((status) => status === OrderItemStatus.Started)) {
      return OrderStatus.Accepted;
    }

    return OrderStatus.New;
  }

  private assertCanSetItemStatus(
    actor: AuthenticatedUser,
    status: OrderItemStatus,
  ): void {
    const managementRoles = [
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
    ];

    if (hasAnyRole(actor.roles, managementRoles)) {
      return;
    }

    if (
      status === OrderItemStatus.Served &&
      hasAnyRole(actor.roles, [Role.Service, Role.Theke])
    ) {
      return;
    }

    if (
      [OrderItemStatus.Started, OrderItemStatus.Preparing, OrderItemStatus.Ready].includes(status) &&
      hasAnyRole(actor.roles, [Role.Kueche, Role.Bar, Role.Theke])
    ) {
      return;
    }

    throw new ForbiddenException('Keine Berechtigung fuer diesen Artikelstatus');
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

  private async writeItemStatusLog(
    order: OrderDocument,
    itemId: string,
    previousStatus: OrderItemStatus,
    newStatus: OrderItemStatus,
    actor: AuthenticatedUser,
    comment?: string,
  ): Promise<void> {
    await this.logModel.create({
      companyId: order.companyId ?? actor.companyId,
      locationId: order.locationId,
      orderId: order._id.toString(),
      itemId,
      action: 'order.item.status.changed',
      fromStatus: previousStatus,
      toStatus: newStatus,
      employeeId: actor.sub,
      employeeName: actor.email,
      employeeRole: this.primaryRole(actor),
      comment,
    });
  }

  private primaryRole(actor: AuthenticatedUser): string {
    return actor.roles?.[0] ?? 'unknown';
  }

  private eventChannels(companyId: string | undefined, locationId: string): string[] {
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

  private async nextOrderNumber(locationId: string): Promise<string> {
    const sequence = await this.countToday(locationId);

    return `B${String(sequence + 1).padStart(4, '0')}`;
  }

  private async nextPickupNumber(locationId: string): Promise<string> {
    const sequence = await this.countToday(locationId);

    return `A${String(sequence + 1).padStart(3, '0')}`;
  }

  private async countToday(locationId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return this.orderModel
      .countDocuments({
        locationId,
        createdAt: {
          $gte: start,
          $lt: end,
        },
      })
      .exec();
  }
}
