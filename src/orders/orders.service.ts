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
import {
  MenuItem,
  MenuItemDocument,
  MenuItemExtra,
} from '../menu-items/schemas/menu-item.schema';
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
  aggregateOrderStatus,
  getTableEventForOrderStatus,
  getTableStatusForOrders,
  getTableWaitingSince,
} from './order-status.utils';
import {
  CourseType,
  Order,
  OrderDocument,
  OrderItem,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  OrderTenantResolutionStatus,
  PaymentStatus,
  ProductionArea,
} from './schemas/order.schema';

export interface OrderFilters {
  locationId?: string;
  tableId?: string;
  status?: string;
  date?: Date;
}

type OrderItemInput = CreateOrderDto['items'][number];

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
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
    this.assertTenantOperationalUser(actor);
    this.validateObjectId(createOrderDto.locationId, 'Standort-ID');
    const location = await this.accessPolicy.assertLocationExistsAndReadable(
      actor,
      createOrderDto.locationId,
    );
    const tenantId = this.resolveOrderTenantId(actor, location);

    if (createOrderDto.tableId) {
      this.validateObjectId(createOrderDto.tableId, 'Tisch-ID');
    }

    const orderItems = await this.normalizeOrderItems(createOrderDto.items);
    const status = createOrderDto.status ?? OrderStatus.New;
    const totals = this.calculateTotals(orderItems);
    const order = await this.orderModel.create({
      ...createOrderDto,
      companyId: actor.companyId,
      tenantId,
      tenantResolutionStatus: OrderTenantResolutionStatus.Resolved,
      tenantResolvedAt: new Date(),
      source: OrderSource.Internal,
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
      items: orderItems,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    });

    this.realtimeService.publish('order.created', order);
    await this.syncTableStatus(order, false, actor, 'table.order.created');

    return order;
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: OrderFilters = {},
  ): Promise<OrderDocument[]> {
    this.assertTenantOperationalUser(actor);
    const query = this.applyTenantScope(
      await this.accessPolicy.getScopedResourceFilter(
        actor,
        filters.locationId,
      ),
      actor,
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
    if (actor) {
      this.assertTenantOperationalUser(actor);
    }

    const order = await this.orderModel.findById(id).exec();

    if (
      !order ||
      (actor &&
        (!(await this.accessPolicy.canAccessLocation(actor, order.locationId)) ||
          !this.isOrderInTenantScope(order, actor)))
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
    await this.accessPolicy.assertCanAccessLocation(
      actor,
      currentOrder.locationId,
    );

    if (updateOrderDto.locationId) {
      this.validateObjectId(updateOrderDto.locationId, 'Standort-ID');
      const location = await this.accessPolicy.assertLocationExistsAndReadable(
        actor,
        updateOrderDto.locationId,
      );
      updateOrderDto = {
        ...updateOrderDto,
        locationId: updateOrderDto.locationId,
      };
      currentOrder.tenantId = this.resolveOrderTenantId(actor, location);
    }

    if (updateOrderDto.tableId) {
      this.validateObjectId(updateOrderDto.tableId, 'Tisch-ID');
    }

    const orderItems = updateOrderDto.items
      ? await this.normalizeOrderItems(updateOrderDto.items)
      : undefined;
    const totals = orderItems ? this.calculateTotals(orderItems) : undefined;
    const { source: _ignoredSource, ...trustedUpdateDto } = updateOrderDto;
    const updatePayload = {
      ...trustedUpdateDto,
      tenantId: currentOrder.tenantId ?? actor.tenantId,
      ...(orderItems
        ? {
            items: orderItems,
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
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!updatedOrder) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    if (
      updatedOrder.status === OrderStatus.Cancelled &&
      this.hasInventoryDeduction(updatedOrder) &&
      !updatedOrder.inventoryReversedAt
    ) {
      await this.reverseOrderInventory(updatedOrder, actor.sub);
    } else if (this.shouldDeductInventory(currentOrder, updatedOrder)) {
      await this.deductOrderInventory(updatedOrder, actor.sub);
    } else if (
      updateOrderDto.items &&
      this.hasInventoryDeduction(currentOrder)
    ) {
      await this.adjustOrderInventory(currentOrder, updatedOrder, actor.sub);
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

  async markPaid(id: string, actor: AuthenticatedUser): Promise<OrderDocument> {
    return this.update(
      id,
      { paymentStatus: PaymentStatus.Paid, status: OrderStatus.Closed },
      actor,
    );
  }

  async close(id: string, actor: AuthenticatedUser): Promise<OrderDocument> {
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
    const nextOrderStatus = aggregateOrderStatus(order);
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
    await this.writeItemStatusLog(
      saved,
      itemId,
      previousStatus,
      dto.status,
      actor,
      note,
    );

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
      channels: this.eventChannels(
        saved.companyId ?? actor.companyId,
        saved.locationId,
      ),
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
        channels: this.eventChannels(
          saved.companyId ?? actor.companyId,
          saved.locationId,
        ),
      });
    }

    return saved;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');
    const order = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, order.locationId);

    if (this.hasInventoryDeduction(order) && !order.inventoryReversedAt) {
      await this.reverseOrderInventory(order, actor.sub);
    }

    const deletedOrder = await this.orderModel.findByIdAndDelete(id).exec();

    if (!deletedOrder) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    this.realtimeService.publish('order.cancelled', deletedOrder);
    await this.syncTableStatus(
      deletedOrder,
      true,
      actor,
      'table.status.changed',
    );

    return deletedOrder;
  }

  private shouldDeductInventory(
    currentOrder: OrderDocument,
    updatedOrder: OrderDocument,
  ): boolean {
    return (
      !this.hasInventoryDeduction(currentOrder) &&
      !this.hasInventoryDeduction(updatedOrder) &&
      updatedOrder.status === OrderStatus.Accepted
    );
  }

  private hasInventoryDeduction(
    order: Pick<OrderDocument, 'inventoryDeducted' | 'inventoryConsumedAt'>,
  ): boolean {
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

  private async adjustOrderInventory(
    currentOrder: OrderDocument,
    updatedOrder: OrderDocument,
    actorId: string,
  ): Promise<void> {
    const result = await this.recipeInventoryService.adjustOrder(
      currentOrder,
      updatedOrder,
      actorId,
    );

    if (!result.movementIds.length && !result.warnings.length) {
      return;
    }

    updatedOrder.inventoryMovementIds = [
      ...(updatedOrder.inventoryMovementIds ?? []),
      ...result.movementIds,
    ];
    updatedOrder.inventoryWarnings = this.uniqueValues([
      ...(updatedOrder.inventoryWarnings ?? []),
      ...result.warnings,
    ]);
    await updatedOrder.save();
  }

  private uniqueValues(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }

  private async normalizeOrderItems(items: OrderItemInput[]): Promise<OrderItem[]> {
    const menuItemIds = this.uniqueValues(
      items
        .map((item) => item.menuItemId ?? item.productId)
        .filter((id): id is string => Boolean(id)),
    );

    const invalidMenuItemId = menuItemIds.find((id) => !Types.ObjectId.isValid(id));

    if (invalidMenuItemId) {
      throw new BadRequestException(`Ungueltige Menueartikel-ID ${invalidMenuItemId}`);
    }

    const menuItems = menuItemIds.length
      ? await this.menuItemModel
          .find({ _id: { $in: menuItemIds }, isActive: true })
          .exec()
      : [];
    const menuItemById = new Map(
      menuItems.map((menuItem) => [menuItem._id.toString(), menuItem]),
    );

    return items.map((item) => {
      const menuItemId = item.menuItemId ?? item.productId;
      const menuItem = menuItemId ? menuItemById.get(menuItemId) : undefined;
      const selectedExtraIds = this.normalizeSelectedExtraIds(item);

      if (selectedExtraIds.length && !menuItem) {
        throw new BadRequestException(
          `Zusatzoptionen fuer Menueartikel ${menuItemId ?? item.name} sind nicht verfuegbar`,
        );
      }

      const selectedExtras = menuItem
        ? this.resolveSelectedExtras(menuItem, selectedExtraIds)
        : [];
      const basePrice =
        menuItem && (item.menuItemId || selectedExtras.length)
          ? menuItem.sellingPrice ?? menuItem.price
          : item.price;
      const price = this.roundMoney(
        basePrice + selectedExtras.reduce((sum, extra) => sum + extra.priceDelta, 0),
      );
      const isKitchenItem = item.isKitchenItem ?? menuItem?.isKitchenItem ?? true;

      return {
        ...item,
        productId: menuItem?.id ?? item.productId ?? item.menuItemId,
        menuItemId: menuItem?.id ?? item.menuItemId,
        name: menuItem ? menuItem.name : item.name,
        price,
        totalPrice: this.calculateItemTotal({ quantity: item.quantity, price }),
        status: item.status ?? OrderItemStatus.Open,
        productionArea:
          item.productionArea ??
          (isKitchenItem === false ? ProductionArea.Bar : ProductionArea.Kitchen),
        courseType: item.courseType ?? CourseType.Main,
        specialRequests: item.specialRequests ?? [],
        allergens: item.allergens ?? [],
        selectedExtras,
        isKitchenItem,
      } satisfies OrderItem;
    });
  }

  private normalizeSelectedExtraIds(item: OrderItemInput): string[] {
    const directIds = item.selectedExtraIds ?? [];
    const snapshotIds = (item.selectedExtras ?? [])
      .map((extra) => extra.extraId)
      .filter(Boolean);

    return this.uniqueValues([...directIds, ...snapshotIds]);
  }

  private resolveSelectedExtras(
    menuItem: MenuItemDocument,
    selectedExtraIds: string[],
  ): NonNullable<OrderItem['selectedExtras']> {
    if (!selectedExtraIds.length) {
      return [];
    }

    const extras = new Map(
      (menuItem.extras ?? []).map((extra) => [extra.id, extra as MenuItemExtra]),
    );

    return selectedExtraIds.map((extraId) => {
      const extra = extras.get(extraId);

      if (!extra || extra.isAvailable === false) {
        throw new BadRequestException(
          `Zusatzoption ${extraId} ist fuer ${menuItem.name} nicht verfuegbar`,
        );
      }

      return {
        extraId: extra.id,
        name: extra.name,
        priceDelta: this.roundMoney(extra.priceDelta ?? 0),
        sendToKitchen: extra.sendToKitchen ?? true,
        inventoryImpact: (extra.inventoryImpact ?? []).map((impact) => ({
          stockItemId: impact.stockItemId,
          stockItemName: impact.stockItemName,
          quantity: Number(impact.quantity),
          unit: impact.unit,
        })),
      };
    });
  }

  private calculateTotals(items: Pick<OrderItem, 'quantity' | 'price'>[]): {
    subtotal: number;
    tax: number;
    total: number;
  } {
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
    const status = getTableStatusForOrders(activeOrders, order, { removed });
    const activeOrderIds = activeOrders.map((activeOrder) =>
      activeOrder._id.toString(),
    );
    const currentTotal = activeOrders.reduce(
      (sum, activeOrder) => sum + (activeOrder.total ?? 0),
      0,
    );
    const guestCount = activeOrders.reduce(
      (sum, activeOrder) => sum + (activeOrder.guestCount ?? 0),
      0,
    );
    const waitingSince = getTableWaitingSince(activeOrders);
    const assignedWaiterId =
      activeOrders.find((activeOrder) => activeOrder.assignedWaiterId)
        ?.assignedWaiterId ?? undefined;
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
        { returnDocument: 'after' },
      )
      .exec();

    if (!updatedTable) {
      return;
    }

    if (table.status !== status) {
      await this.writeTableStatusLog(
        updatedTable,
        table.status,
        status,
        actor,
        {
          orderId: order._id?.toString(),
          reason: eventName,
          changedAt,
        },
      );
    }

    this.publishTableStatusEvent(
      eventName,
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

    const mappedEvent = getTableEventForOrderStatus(
      order.status,
      order.paymentStatus,
    );
    if (mappedEvent && mappedEvent !== eventName) {
      this.publishTableStatusEvent(
        mappedEvent,
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
  }

  private async getActiveOrdersForTable(
    tableId: string,
  ): Promise<OrderDocument[]> {
    return this.orderModel
      .find({
        tableId,
        status: { $nin: [OrderStatus.Cancelled, OrderStatus.Closed] },
        tenantId: { $exists: true, $nin: [null, ''] },
        tenantResolutionStatus: {
          $ne: OrderTenantResolutionStatus.LegacyOrphan,
        },
      })
      .sort({ createdAt: 1 })
      .exec();
  }

  private getPrimaryTableEventForOrderUpdate(
    status: OrderStatus,
    paymentStatus: PaymentStatus | undefined,
    statusChanged: boolean,
  ): string {
    if (!statusChanged) {
      return 'table.status.changed';
    }

    return (
      getTableEventForOrderStatus(status, paymentStatus) ??
      'table.status.changed'
    );
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
      channels: this.eventChannels(
        table.companyId ?? actor?.companyId,
        table.locationId,
      ),
      ...metadata,
    });
  }

  private assertCanSetItemStatus(
    actor: AuthenticatedUser,
    status: OrderItemStatus,
  ): void {
    const managementRoles = [
      Role.TenantAdminCode,
      Role.TenantAdmin,
      Role.CompanyAdmin,
      Role.RegionAdmin,
      Role.Admin,
      Role.Regionalleiter,
      Role.Bereichsleiter,
      Role.Filialleiter,
      Role.LocationManager,
      Role.Restaurantleiter,
      Role.Schichtleiter,
    ];

    if (hasAnyRole(actor.roles, managementRoles)) {
      return;
    }

    if (
      status === OrderItemStatus.Served &&
      hasAnyRole(actor.roles, [
        Role.Waiter,
        Role.Service,
        Role.Counter,
        Role.Theke,
      ])
    ) {
      return;
    }

    if (
      [
        OrderItemStatus.Started,
        OrderItemStatus.Preparing,
        OrderItemStatus.Ready,
      ].includes(status) &&
      hasAnyRole(actor.roles, [
        Role.Kitchen,
        Role.Kueche,
        Role.Bar,
        Role.Counter,
        Role.Theke,
      ])
    ) {
      return;
    }

    throw new ForbiddenException(
      'Keine Berechtigung fuer diesen Artikelstatus',
    );
  }

  private assertTenantOperationalUser(actor: AuthenticatedUser): void {
    if (this.accessPolicy.isPlatformAdmin(actor)) {
      throw new ForbiddenException('Platform Admin darf keine operativen Bestellungen nutzen');
    }

    if (!actor.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext fuer Bestellungen');
    }
  }

  private resolveOrderTenantId(
    actor: AuthenticatedUser,
    location: { tenantId?: string },
  ): string {
    if (location.tenantId && location.tenantId !== actor.tenantId) {
      throw new ForbiddenException('Standort gehoert nicht zu diesem Tenant');
    }

    if (actor.tenantId) {
      return actor.tenantId;
    }

    if (location.tenantId) {
      return location.tenantId;
    }

    throw new ForbiddenException('Tenant der Bestellung konnte nicht ermittelt werden');
  }

  private applyTenantScope(
    query: Record<string, unknown>,
    actor: AuthenticatedUser,
  ): Record<string, unknown> {
    if (!actor.tenantId) {
      return query;
    }

    const existingAnd = Array.isArray(query.$and)
      ? (query.$and as Record<string, unknown>[])
      : [];

    return {
      ...query,
      $and: [
        ...existingAnd,
        {
          tenantId: actor.tenantId,
        },
        {
          tenantResolutionStatus: {
            $ne: OrderTenantResolutionStatus.LegacyOrphan,
          },
        },
      ],
    };
  }

  private isOrderInTenantScope(
    order: Pick<OrderDocument, 'tenantId' | 'tenantResolutionStatus'>,
    actor: AuthenticatedUser,
  ): boolean {
    return (
      Boolean(actor.tenantId) &&
      order.tenantId === actor.tenantId &&
      order.tenantResolutionStatus !== OrderTenantResolutionStatus.LegacyOrphan
    );
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
        tenantResolutionStatus: {
          $ne: OrderTenantResolutionStatus.LegacyOrphan,
        },
        createdAt: {
          $gte: start,
          $lt: end,
        },
      })
      .exec();
  }
}
