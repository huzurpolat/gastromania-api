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
  OrderItemStatus,
  OrderStatus,
  ProductionArea,
} from '../orders/schemas/order.schema';
import { RealtimeService } from '../realtime/realtime.service';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableStatus,
} from '../tables/schemas/table.schema';
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
    @InjectModel(KdsStatusLog.name)
    private readonly logModel: Model<KdsStatusLogDocument>,
    @InjectModel(KdsSettings.name)
    private readonly settingsModel: Model<KdsSettingsDocument>,
    private readonly realtimeService: RealtimeService,
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
    await this.syncTableStatus(saved);
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
    item.status = dto.status;
    item.changedAt = new Date();

    const saved = await order.save();
    await this.writeLog(saved, 'order.itemUpdated', actor, {
      itemId,
      fromStatus: previousStatus,
      toStatus: dto.status,
      comment: dto.comment,
      employeeName: dto.employeeName,
    });

    this.realtimeService.publish('order.itemUpdated', saved);

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

  private async syncTableStatus(order: OrderDocument): Promise<void> {
    if (!order.tableId) {
      return;
    }

    const status =
      order.status === OrderStatus.Served
        ? TableStatus.ReadyToPay
        : order.status === OrderStatus.Cancelled
          ? TableStatus.Free
          : TableStatus.InProgress;

    await this.tableModel
      .findByIdAndUpdate(order.tableId, { status }, { new: true })
      .exec();
    this.realtimeService.publish('table.statusChanged', {
      tableId: order.tableId,
      status,
    });
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
      locationId: order.locationId,
      orderId: order._id.toString(),
      itemId: options.itemId,
      action,
      fromStatus: options.fromStatus,
      toStatus: options.toStatus,
      employeeId: actor.sub,
      employeeName: options.employeeName ?? actor.email,
      comment: options.comment,
    });
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
