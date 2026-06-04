import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import {
  Order,
  OrderDocument,
  OrderItemStatus,
  OrderStatus,
} from '../orders/schemas/order.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableStatusDto } from './dto/update-table-status.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableShape,
  TableStatus,
} from './schemas/table.schema';
import {
  TableStatusLog,
  TableStatusLogDocument,
} from './schemas/table-status-log.schema';

type WaitingState = 'none' | 'normal' | 'warning' | 'critical' | 'done';

interface TableOverviewOrder {
  orderId: string;
  orderNumber?: string;
  status: OrderStatus;
  total: number;
  itemCount: number;
  openItemCount: number;
  waitingSince?: Date;
  waitingMinutes: number;
  waitingState: WaitingState;
}

const TABLE_STATUS_TRANSITIONS = new Map<TableStatus, TableStatus[]>([
  [
    TableStatus.Free,
    [TableStatus.OccupiedState, TableStatus.ReservedState, TableStatus.Dirty],
  ],
  [
    TableStatus.OccupiedState,
    [
      TableStatus.Ordering,
      TableStatus.ReadyToPay,
      TableStatus.Dirty,
      TableStatus.Free,
    ],
  ],
  [
    TableStatus.Ordering,
    [
      TableStatus.OrderSent,
      TableStatus.InPreparation,
      TableStatus.ReadyToPay,
      TableStatus.Dirty,
    ],
  ],
  [
    TableStatus.OrderSent,
    [
      TableStatus.InPreparation,
      TableStatus.ReadyToServe,
      TableStatus.ReadyToPay,
      TableStatus.Dirty,
    ],
  ],
  [
    TableStatus.InPreparation,
    [TableStatus.ReadyToServe, TableStatus.ReadyToPay, TableStatus.Dirty],
  ],
  [
    TableStatus.ReadyToServe,
    [TableStatus.Served, TableStatus.ReadyToPay, TableStatus.Dirty],
  ],
  [
    TableStatus.Served,
    [TableStatus.ReadyToPay, TableStatus.Paid, TableStatus.Dirty],
  ],
  [TableStatus.ReadyToPay, [TableStatus.Paid, TableStatus.Dirty]],
  [TableStatus.Paid, [TableStatus.Dirty, TableStatus.Free]],
  [TableStatus.Dirty, [TableStatus.Free]],
  [TableStatus.ReservedState, [TableStatus.OccupiedState, TableStatus.Free]],
  [
    TableStatus.Available,
    [TableStatus.OccupiedState, TableStatus.ReservedState, TableStatus.Dirty],
  ],
  [
    TableStatus.Occupied,
    [
      TableStatus.Ordering,
      TableStatus.ReadyToPay,
      TableStatus.Dirty,
      TableStatus.Free,
    ],
  ],
  [TableStatus.Reserved, [TableStatus.OccupiedState, TableStatus.Free]],
  [
    TableStatus.InProgress,
    [TableStatus.ReadyToServe, TableStatus.ReadyToPay, TableStatus.Dirty],
  ],
  [TableStatus.Inactive, []],
]);

export interface TableOverviewItem {
  tableId: string;
  tableName: string;
  locationId: string;
  status: TableStatus;
  guestCount: number;
  activeOrderCount: number;
  openItemCount: number;
  currentTotal: number;
  paidTotal: number;
  waitingSince?: Date;
  waitingMinutes: number;
  waitingState: WaitingState;
  latestOrderStatus?: OrderStatus;
  activeOrders: TableOverviewOrder[];
}

export interface TableQrInfo {
  tableId: string;
  tableName: string;
  locationId: string;
  qrEnabled: boolean;
  qrToken?: string;
  qrTokenCreatedAt?: Date;
  qrTokenRevokedAt?: Date;
  qrMenuId?: string;
  publicUrl?: string;
  printableLabel: string;
}

@Injectable()
export class TablesService {
  constructor(
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(TableStatusLog.name)
    private readonly tableStatusLogModel: Model<TableStatusLogDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly accessPolicy: AccessPolicyService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async create(
    createTableDto: CreateTableDto,
    actor: AuthenticatedUser,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(createTableDto.locationId, 'Standort-ID');
    await this.accessPolicy.assertCanManageLocation(
      actor,
      createTableDto.locationId,
    );
    const payload = await this.normalizeTableFloor(createTableDto);

    try {
      return await this.tableModel.create(payload);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Tisch mit diesem Namen existiert bereits an diesem Standort',
        );
      }

      throw error;
    }
  }

  async findAll(
    actor: AuthenticatedUser,
    locationId?: string,
    floorId?: string,
  ): Promise<RestaurantTableDocument[]> {
    if (locationId) {
      this.validateObjectId(locationId, 'Standort-ID');
    }
    const scopeFilter = await this.accessPolicy.getScopedResourceFilter(
      actor,
      locationId,
    );
    const filter = {
      ...scopeFilter,
      ...(floorId ? { floorId } : {}),
    };

    return this.tableModel
      .find(filter)
      .sort({ locationId: 1, floorId: 1, name: 1 })
      .exec();
  }

  async overview(
    actor: AuthenticatedUser,
    locationId?: string,
    floorId?: string,
  ): Promise<TableOverviewItem[]> {
    const tables = await this.findAll(actor, locationId, floorId);
    const tableIds = tables.map((table) => table._id.toString());

    if (!tableIds.length) {
      return [];
    }

    const orders = await this.orderModel
      .find({
        tableId: { $in: tableIds },
        status: { $nin: [OrderStatus.Cancelled, OrderStatus.Closed] },
      })
      .sort({ createdAt: -1 })
      .exec();

    const ordersByTable = new Map<string, OrderDocument[]>();

    for (const order of orders) {
      if (!order.tableId) {
        continue;
      }

      ordersByTable.set(order.tableId, [
        ...(ordersByTable.get(order.tableId) ?? []),
        order,
      ]);
    }

    return tables.map((table) =>
      this.toOverviewItem(table, ordersByTable.get(table._id.toString()) ?? []),
    );
  }

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(id, 'Tisch-ID');

    const table = await this.tableModel.findById(id).exec();

    if (
      !table ||
      !(await this.accessPolicy.canAccessLocation(actor, table.locationId))
    ) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    return table;
  }

  async update(
    id: string,
    updateTableDto: UpdateTableDto,
    actor: AuthenticatedUser,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(id, 'Tisch-ID');
    const existing = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, existing.locationId);

    if (updateTableDto.locationId) {
      this.validateObjectId(updateTableDto.locationId, 'Standort-ID');
      await this.accessPolicy.assertCanManageLocation(
        actor,
        updateTableDto.locationId,
      );
    }
    const payload = await this.normalizeTableFloor(
      {
        ...updateTableDto,
        floorId: updateTableDto.floorId ?? existing.floorId,
        floorName: updateTableDto.floorName ?? existing.floorName,
        planFloor: updateTableDto.planFloor ?? existing.planFloor,
      },
      existing.locationId,
    );

    try {
      const updatedTable = await this.tableModel
        .findByIdAndUpdate(id, payload, {
          new: true,
          runValidators: true,
        })
        .exec();

      if (!updatedTable) {
        throw new NotFoundException('Tisch nicht gefunden');
      }

      return updatedTable;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Tisch mit diesem Namen existiert bereits an diesem Standort',
        );
      }

      throw error;
    }
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(id, 'Tisch-ID');
    const existing = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, existing.locationId);

    const deletedTable = await this.tableModel.findByIdAndDelete(id).exec();

    if (!deletedTable) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    return deletedTable;
  }

  async createStartTablesForFloor(
    actor: AuthenticatedUser,
    locationId: string,
    floorId: string,
  ): Promise<RestaurantTableDocument[]> {
    this.validateObjectId(locationId, 'Standort-ID');
    await this.accessPolicy.assertCanManageLocation(actor, locationId);
    const floor = await this.resolveFloor(locationId, floorId, undefined);

    return this.createMissingStartTables(locationId, floor.id, floor.name, {
      companyId: actor.companyId,
      regionId: actor.regionIds?.[0],
    });
  }

  async generateQrToken(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<TableQrInfo> {
    const table = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, table.locationId);
    const now = new Date();
    const updated = await this.tableModel
      .findByIdAndUpdate(
        id,
        {
          qrToken: await this.createUniqueQrToken(),
          qrTokenCreatedAt: now,
          qrTokenRevokedAt: undefined,
          qrEnabled: true,
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    this.realtimeService.publish('table.qr.generated', this.toQrInfo(updated));
    return this.toQrInfo(updated);
  }

  async revokeQrToken(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<TableQrInfo> {
    const table = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, table.locationId);
    const updated = await this.tableModel
      .findByIdAndUpdate(
        id,
        {
          qrEnabled: false,
          qrTokenRevokedAt: new Date(),
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    this.realtimeService.publish('table.qr.revoked', this.toQrInfo(updated));
    return this.toQrInfo(updated);
  }

  async setQrEnabled(
    id: string,
    enabled: boolean,
    actor: AuthenticatedUser,
  ): Promise<TableQrInfo> {
    const table = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, table.locationId);
    const patch: Record<string, unknown> = {
      qrEnabled: enabled,
      qrTokenRevokedAt: enabled ? undefined : new Date(),
    };

    if (enabled && !table.qrToken) {
      patch.qrToken = await this.createUniqueQrToken();
      patch.qrTokenCreatedAt = new Date();
    }

    const updated = await this.tableModel
      .findByIdAndUpdate(id, patch, { new: true, runValidators: true })
      .exec();

    if (!updated) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    this.realtimeService.publish(
      'table.qr.enabled.changed',
      this.toQrInfo(updated),
    );
    return this.toQrInfo(updated);
  }

  async getQrCodeInfo(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<TableQrInfo> {
    const table = await this.findOne(id, actor);
    await this.accessPolicy.assertCanAccessLocation(actor, table.locationId);
    return this.toQrInfo(table);
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private async normalizeTableFloor<T extends Partial<CreateTableDto>>(
    dto: T,
    fallbackLocationId?: string,
  ): Promise<T & { floorId: string; floorName: string; planFloor: string }> {
    const locationId = dto.locationId ?? fallbackLocationId;

    if (!locationId) {
      throw new BadRequestException('Standort-ID ist erforderlich');
    }

    const floorName = dto.floorName ?? dto.planFloor;
    if (!dto.floorId && !floorName) {
      throw new BadRequestException('Etage ist erforderlich');
    }

    const floor = await this.resolveFloor(locationId, dto.floorId, floorName);

    return {
      ...dto,
      floorId: floor.id,
      floorName: floor.name,
      planFloor: floor.name,
    };
  }

  private async resolveFloor(
    locationId: string,
    floorId: string | undefined,
    floorName: string | undefined,
  ): Promise<{ id: string; name: string }> {
    const location = await this.locationModel
      .findById(locationId)
      .select('tablePlanFloors')
      .lean()
      .exec();

    if (!location) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    const floors = this.normalizeFloors(location.tablePlanFloors);
    const requestedName = floorName?.trim();
    const requestedId = floorId?.trim();
    const resolvedByName = requestedName
      ? floors.find(
          (floor) => floor.toLowerCase() === requestedName.toLowerCase(),
        )
      : undefined;
    const resolvedById = requestedId
      ? floors.find(
          (floor) => this.toFloorId(locationId, floor) === requestedId,
        )
      : undefined;

    const name = resolvedByName ?? resolvedById;

    if (!name) {
      throw new BadRequestException('Etage gehoert nicht zum Standort');
    }

    return {
      id: this.toFloorId(locationId, name),
      name,
    };
  }

  private async createMissingStartTables(
    locationId: string,
    floorId: string,
    floorName: string,
    scope: { companyId?: string; regionId?: string } = {},
  ): Promise<RestaurantTableDocument[]> {
    const existingCount = await this.tableModel.countDocuments({
      locationId,
      floorId,
    });

    if (existingCount > 0) {
      return [];
    }

    const positions = [
      { name: 'Tisch 1', x: 80, y: 80 },
      { name: 'Tisch 2', x: 260, y: 80 },
      { name: 'Tisch 3', x: 440, y: 80 },
    ];

    const created: RestaurantTableDocument[] = [];

    for (const position of positions) {
      const table = await this.tableModel.create({
        ...scope,
        locationId,
        name: await this.createAvailableStartTableName(
          locationId,
          position.name,
        ),
        seats: 4,
        area: floorName,
        icon: 'table_restaurant',
        status: TableStatus.Free,
        isActive: true,
        planX: Number((position.x / 10).toFixed(2)),
        planY: Number((position.y / 10).toFixed(2)),
        planWidth: 14,
        planHeight: 12,
        planRotation: 0,
        floorId,
        floorName,
        planFloor: floorName,
        planShape: TableShape.Rectangle,
      });
      created.push(table);
    }

    return created;
  }

  private async createAvailableStartTableName(
    locationId: string,
    baseName: string,
  ): Promise<string> {
    let candidate = baseName;
    let suffix = 2;

    while (await this.tableModel.exists({ locationId, name: candidate })) {
      candidate = `${baseName} (${suffix})`;
      suffix += 1;
    }

    return candidate;
  }

  private normalizeFloors(floors: string[] | undefined): string[] {
    const normalized = new Set(
      ['EG', ...(floors ?? [])].map((floor) => floor.trim()).filter(Boolean),
    );

    return Array.from(normalized);
  }

  private toFloorId(locationId: string, floorName: string): string {
    const slug = floorName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${locationId}:${slug || 'floor'}`;
  }

  async updateStatus(
    id: string,
    dto: UpdateTableStatusDto,
    actor: AuthenticatedUser,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(id, 'Tisch-ID');
    const existing = await this.findOne(id, actor);
    await this.accessPolicy.assertCanAccessLocation(actor, existing.locationId);
    this.assertTableStatusTransition(existing.status, dto.status);

    const changedAt = new Date();
    const patch = {
      status: dto.status,
      guestCount: dto.guestCount ?? existing.guestCount ?? 0,
      assignedWaiterId: dto.assignedWaiterId ?? existing.assignedWaiterId,
      reservationId: dto.reservationId ?? existing.reservationId,
      notes: dto.notes ?? existing.notes,
      lastStatusChange: changedAt,
      ...(this.isFreeOrDirty(dto.status)
        ? {
            activeOrderIds: [],
            currentTotal: 0,
            waitingSince: undefined,
            guestCount: 0,
            assignedWaiterId: undefined,
            reservationId: undefined,
          }
        : {}),
    };

    const updatedTable = await this.tableModel
      .findByIdAndUpdate(id, patch, { new: true, runValidators: true })
      .exec();

    if (!updatedTable) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    await this.writeStatusLog(
      updatedTable,
      existing.status,
      dto.status,
      actor,
      {
        reason: dto.reason,
        reservationId: dto.reservationId ?? existing.reservationId,
        changedAt,
      },
    );
    this.publishTableEvent(
      'table.status.changed',
      updatedTable,
      existing.status,
      dto.status,
      {
        changedBy: actor.sub,
        changedByRole: this.primaryRole(actor),
        reason: dto.reason,
        changedAt,
      },
    );

    if (dto.status === TableStatus.Free) {
      this.publishTableEvent(
        'table.cleaned',
        updatedTable,
        existing.status,
        dto.status,
        {
          changedBy: actor.sub,
          changedAt,
        },
      );
    }

    return updatedTable;
  }

  private toOverviewItem(
    table: RestaurantTableDocument,
    orders: OrderDocument[],
  ): TableOverviewItem {
    const activeOrders = orders.map((order) => this.toOverviewOrder(order));
    const latestOrder = orders[0];
    const openItemCount = activeOrders.reduce(
      (sum, order) => sum + order.openItemCount,
      0,
    );
    const currentTotal = activeOrders.reduce(
      (sum, order) => sum + order.total,
      0,
    );
    const waitingOrder = [...activeOrders]
      .filter((order) => order.waitingState !== 'none')
      .sort((first, second) => second.waitingMinutes - first.waitingMinutes)[0];

    return {
      tableId: table._id.toString(),
      tableName: table.name,
      locationId: table.locationId,
      status: this.getOverviewTableStatus(table, activeOrders, latestOrder),
      guestCount: latestOrder?.guestCount ?? table.guestCount ?? 0,
      activeOrderCount: activeOrders.length,
      openItemCount,
      currentTotal: this.roundMoney(currentTotal || table.currentTotal || 0),
      paidTotal: activeOrders
        .filter((order) => this.isPaidOrderStatus(order.status))
        .reduce((sum, order) => sum + order.total, 0),
      waitingSince: waitingOrder?.waitingSince ?? table.waitingSince,
      waitingMinutes: waitingOrder?.waitingMinutes ?? 0,
      waitingState: waitingOrder?.waitingState ?? 'none',
      latestOrderStatus: latestOrder?.status,
      activeOrders,
    };
  }

  private toOverviewOrder(order: OrderDocument): TableOverviewOrder {
    const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const openItemCount = order.items
      .filter(
        (item) =>
          ![OrderItemStatus.Served, OrderItemStatus.Cancelled].includes(
            item.status ?? OrderItemStatus.Open,
          ),
      )
      .reduce((sum, item) => sum + item.quantity, 0);
    const waitingWindow = this.getWaitingWindow(order);

    return {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total ?? 0,
      itemCount,
      openItemCount,
      waitingSince: waitingWindow.waitingSince,
      waitingMinutes: waitingWindow.minutes,
      waitingState: waitingWindow.state,
    };
  }

  private getWaitingWindow(order: OrderDocument): {
    waitingSince?: Date;
    minutes: number;
    state: WaitingState;
  } {
    const timestamps = order.statusTimestamps ?? {};
    const waitingSince =
      timestamps[OrderStatus.Accepted] ??
      timestamps[OrderStatus.Preparing] ??
      timestamps[OrderStatus.New] ??
      (order as OrderDocument & { createdAt?: Date }).createdAt;

    if (!waitingSince) {
      return { minutes: 0, state: 'none' };
    }

    const readyAt = timestamps[OrderStatus.Ready];
    const servedAt = timestamps[OrderStatus.Served];
    const isFinished = Boolean(
      readyAt || servedAt || this.isPaidOrderStatus(order.status),
    );
    const endAt = readyAt ?? servedAt ?? new Date();
    const minutes = Math.max(
      0,
      Math.floor((endAt.getTime() - waitingSince.getTime()) / 60000),
    );

    if (isFinished) {
      return { waitingSince, minutes, state: 'done' };
    }

    return {
      waitingSince,
      minutes,
      state: this.getWaitingState(minutes),
    };
  }

  private getWaitingState(minutes: number): WaitingState {
    if (minutes >= 20) {
      return 'critical';
    }

    if (minutes >= 10) {
      return 'warning';
    }

    return 'normal';
  }

  private getOverviewTableStatus(
    table: RestaurantTableDocument,
    orders: TableOverviewOrder[],
    latestOrder?: OrderDocument,
  ): TableStatus {
    if (!table.isActive) {
      return TableStatus.Inactive;
    }

    if (!orders.length) {
      return table.status;
    }

    if (orders.some((order) => order.status === OrderStatus.Preparing)) {
      return TableStatus.InPreparation;
    }

    if (orders.some((order) => order.status === OrderStatus.Ready)) {
      return TableStatus.ReadyToServe;
    }

    if (orders.some((order) => order.status === OrderStatus.Accepted)) {
      return TableStatus.OrderSent;
    }

    if (orders.some((order) => order.status === OrderStatus.New)) {
      return TableStatus.Ordering;
    }

    if (latestOrder?.status === OrderStatus.Served) {
      return TableStatus.Served;
    }

    return table.status;
  }

  private assertTableStatusTransition(
    currentStatus: TableStatus,
    nextStatus: TableStatus,
  ): void {
    if (currentStatus === nextStatus) {
      return;
    }

    const normalizedCurrent = this.normalizeTableStatus(currentStatus);
    const normalizedNext = this.normalizeTableStatus(nextStatus);

    if (normalizedCurrent === normalizedNext) {
      return;
    }

    if (
      !TABLE_STATUS_TRANSITIONS.get(normalizedCurrent)?.includes(normalizedNext)
    ) {
      throw new BadRequestException(
        `Statuswechsel von ${currentStatus} zu ${nextStatus} ist nicht erlaubt`,
      );
    }
  }

  private normalizeTableStatus(status: TableStatus): TableStatus {
    if (status === TableStatus.Available) {
      return TableStatus.Free;
    }
    if (status === TableStatus.Occupied) {
      return TableStatus.OccupiedState;
    }
    if (status === TableStatus.Reserved) {
      return TableStatus.ReservedState;
    }
    if (status === TableStatus.InProgress) {
      return TableStatus.InPreparation;
    }

    return status;
  }

  private isFreeOrDirty(status: TableStatus): boolean {
    return [
      TableStatus.Free,
      TableStatus.Available,
      TableStatus.Dirty,
    ].includes(status);
  }

  private async writeStatusLog(
    table: RestaurantTableDocument,
    previousStatus: TableStatus | undefined,
    nextStatus: TableStatus,
    actor: AuthenticatedUser,
    options: {
      orderId?: string;
      reservationId?: string;
      reason?: string;
      changedAt?: Date;
    } = {},
  ): Promise<void> {
    await this.tableStatusLogModel.create({
      companyId: table.companyId ?? actor.companyId,
      regionId: table.regionId,
      locationId: table.locationId,
      tableId: table._id.toString(),
      tableName: table.tableName ?? table.name,
      previousStatus,
      nextStatus,
      orderId: options.orderId,
      reservationId: options.reservationId,
      userId: actor.sub,
      userRole: this.primaryRole(actor),
      reason: options.reason,
      changedAt: options.changedAt ?? new Date(),
    });
  }

  private publishTableEvent(
    event: string,
    table: RestaurantTableDocument,
    previousStatus?: TableStatus,
    nextStatus?: TableStatus,
    metadata: Record<string, unknown> = {},
  ): void {
    this.realtimeService.publish(event, {
      tableId: table._id.toString(),
      tableName: table.tableName ?? table.name,
      locationId: table.locationId,
      companyId: table.companyId,
      regionId: table.regionId,
      previousStatus,
      status: nextStatus ?? table.status,
      currentTotal: table.currentTotal ?? 0,
      guestCount: table.guestCount ?? 0,
      activeOrderIds: table.activeOrderIds ?? [],
      waitingSince: table.waitingSince,
      lastStatusChange: table.lastStatusChange,
      channels: this.eventChannels(table.companyId, table.locationId),
      ...metadata,
    });
  }

  private eventChannels(
    companyId: string | undefined,
    locationId: string,
  ): string[] {
    return [
      ...(companyId ? [`company:${companyId}`] : []),
      `location:${locationId}`,
      `service:${locationId}`,
      `kitchen:${locationId}`,
    ];
  }

  private primaryRole(actor: AuthenticatedUser): string {
    return actor.roles?.[0] ?? 'unknown';
  }

  private isPaidOrderStatus(status: OrderStatus): boolean {
    return [OrderStatus.Closed, OrderStatus.Served].includes(status);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private async createUniqueQrToken(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = randomBytes(32).toString('base64url');
      const existing = await this.tableModel.exists({ qrToken: token });

      if (!existing) {
        return token;
      }
    }

    throw new ConflictException(
      'QR-Token konnte nicht eindeutig erzeugt werden',
    );
  }

  private toQrInfo(table: RestaurantTableDocument): TableQrInfo {
    const publicUrl = table.qrToken
      ? `${this.publicFrontendOrigin()}/qr-order/${table.qrToken}`
      : undefined;

    return {
      tableId: table._id.toString(),
      tableName: table.tableName ?? table.name,
      locationId: table.locationId,
      qrEnabled: Boolean(table.qrEnabled),
      qrToken: table.qrToken,
      qrTokenCreatedAt: table.qrTokenCreatedAt,
      qrTokenRevokedAt: table.qrTokenRevokedAt,
      qrMenuId: table.qrMenuId,
      publicUrl,
      printableLabel: `${table.tableName ?? table.name} - Gastromania QR-Bestellung`,
    };
  }

  private publicFrontendOrigin(): string {
    return (
      process.env.PUBLIC_FRONTEND_ORIGIN ??
      process.env.FRONTEND_ORIGIN?.split(',')[0]?.trim() ??
      'https://gastromania.gastrowerk24.de'
    );
  }
}
