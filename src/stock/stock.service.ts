import {
  BadRequestException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable, Subject, filter, from, map, switchMap } from 'rxjs';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { CreateInventoryLocationDto } from './dto/create-inventory-location.dto';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import {
  CompleteInventorySessionDto,
  StartInventorySessionDto,
} from './dto/inventory-session.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { ReportWasteDto } from './dto/report-waste.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import {
  InventoryBatch,
  InventoryBatchDocument,
} from './schemas/inventory-batch.schema';
import {
  InventoryCategory,
  InventoryCategoryDocument,
} from './schemas/inventory-category.schema';
import {
  InventoryCount,
  InventoryCountDocument,
} from './schemas/inventory-count.schema';
import {
  InventoryLocation,
  InventoryLocationDocument,
} from './schemas/inventory-location.schema';
import {
  InventorySession,
  InventorySessionDocument,
  InventorySessionStatus,
} from './schemas/inventory-session.schema';
import { StockAlert, StockAlertDocument } from './schemas/stock-alert.schema';
import { StockItem, StockItemDocument } from './schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementDocument,
  StockMovementType,
} from './schemas/stock-movement.schema';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderStatus,
} from './schemas/purchase-order.schema';

export interface StockItemResponse {
  _id: string;
  articleNumber?: string;
  locationId: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  criticalQuantity: number;
  targetQuantity?: number;
  supplierId?: string;
  supplierName?: string;
  ean?: string;
  purchasePriceNet: number;
  purchasePriceGross: number;
  salePrice: number;
  vatRate: number;
  storageLocation?: string;
  requiresExpiryDate: boolean;
  ingredientCategory?: string;
  note?: string;
  isActive: boolean;
  isArchived: boolean;
  lowStock: boolean;
  stockValueNet: number;
  criticalStock: boolean;
  negativeStock: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StockMovementResponse {
  _id: string;
  tenantId?: string;
  locationId: string;
  stockItemId: string;
  batchId?: string;
  orderId?: string;
  orderItemId?: string;
  recipeId?: string;
  menuItemId?: string;
  referenceType?: string;
  referenceId?: string;
  stockItemName: string;
  type: string;
  quantityChange: number;
  quantity: number;
  unit?: string;
  quantityBefore: number;
  quantityAfter: number;
  note?: string;
  reason?: string;
  supplierId?: string;
  supplierName?: string;
  unitPriceNet: number;
  valueNet: number;
  actorId: string;
  createdAt?: string;
}

export interface InventoryBatchResponse {
  _id: string;
  locationId: string;
  stockItemId: string;
  stockItemName: string;
  unit: string;
  batchNumber?: string;
  initialQuantity: number;
  remainingQuantity: number;
  unitPriceNet: number;
  supplierId?: string;
  supplierName?: string;
  storageLocation?: string;
  receivedAt?: string;
  expiresAt?: string;
  note?: string;
  isActive: boolean;
  daysUntilExpiry?: number;
  expiringSoon: boolean;
}

export interface InventoryDashboardResponse {
  itemCount: number;
  totalStockValueNet: number;
  lowStockCount: number;
  openInventorySessions: number;
  receiptsToday: number;
  issuesToday: number;
  shrinkageToday: number;
  expiringSoonCount: number;
  negativeStockCount: number;
  topUsageItems: Array<{ stockItemId: string; name: string; quantity: number }>;
}

export interface StockEvent {
  type: 'created' | 'updated' | 'adjusted' | 'deleted';
  item: StockItemResponse;
  movement?: StockMovementResponse;
}

@Injectable()
export class StockService {
  private readonly stockEvents$ = new Subject<StockEvent>();

  constructor(
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(InventoryBatch.name)
    private readonly batchModel: Model<InventoryBatchDocument>,
    @InjectModel(PurchaseOrder.name)
    private readonly purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(InventoryLocation.name)
    private readonly inventoryLocationModel: Model<InventoryLocationDocument>,
    @InjectModel(InventoryCategory.name)
    private readonly inventoryCategoryModel: Model<InventoryCategoryDocument>,
    @InjectModel(StockAlert.name)
    private readonly stockAlertModel: Model<StockAlertDocument>,
    @InjectModel(InventorySession.name)
    private readonly inventorySessionModel: Model<InventorySessionDocument>,
    @InjectModel(InventoryCount.name)
    private readonly inventoryCountModel: Model<InventoryCountDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    payload: CreateStockItemDto,
    actor: AuthenticatedUser,
  ): Promise<StockItemResponse> {
    await this.assertCanUseLocation(actor, payload.locationId);

    const item = await this.stockItemModel.create({
      ...payload,
      purchasePriceNet: payload.purchasePriceNet ?? 0,
      purchasePriceGross: payload.purchasePriceGross ?? 0,
      salePrice: payload.salePrice ?? 0,
      vatRate: payload.vatRate ?? 19,
      isArchived: payload.isArchived ?? false,
    });
    await this.syncLowStockAlert(item);
    const response = this.toItemResponse(item);
    this.stockEvents$.next({ type: 'created', item: response });
    return response;
  }

  async findAll(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<StockItemResponse[]> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);

    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );

    const items = await this.stockItemModel
      .find({ locationId: { $in: locationIds } })
      .sort({ category: 1, name: 1 })
      .exec();

    return items.map((item) => this.toItemResponse(item));
  }

  async findMovements(
    actor: AuthenticatedUser,
    locationId?: string,
    type?: StockMovementType,
  ): Promise<StockMovementResponse[]> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);

    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );

    const movements = await this.movementModel
      .find({
        locationId: { $in: locationIds },
        ...(type ? { type } : {}),
      })
      .sort({ createdAt: -1 })
      .limit(80)
      .exec();

    return movements.map((movement) => this.toMovementResponse(movement));
  }

  async findBatches(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<InventoryBatchResponse[]> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);

    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );

    const batches = await this.batchModel
      .find({
        locationId: { $in: locationIds },
        isActive: true,
        remainingQuantity: { $gt: 0 },
      })
      .sort({ expiresAt: 1, receivedAt: 1 })
      .exec();

    return batches.map((batch) => this.toBatchResponse(batch));
  }

  async receiveStock(
    payload: ReceiveStockDto,
    actor: AuthenticatedUser,
  ): Promise<StockEvent & { batch: InventoryBatchResponse }> {
    const item = await this.stockItemModel.findById(payload.stockItemId).exec();

    if (!item) {
      throw new NotFoundException('Lagerartikel nicht gefunden');
    }

    await this.assertCanUseLocation(actor, item.locationId);

    if (item.requiresExpiryDate && !payload.expiresAt) {
      throw new BadRequestException('MHD ist fuer diese Zutat erforderlich');
    }

    const receivedAt = payload.receivedAt
      ? new Date(payload.receivedAt)
      : new Date();
    const unitPriceNet = payload.unitPriceNet ?? item.purchasePriceNet ?? 0;
    const quantityBefore = item.quantity;
    item.quantity = quantityBefore + payload.quantity;
    item.purchasePriceNet = unitPriceNet || item.purchasePriceNet;
    item.supplierId = payload.supplierId ?? item.supplierId;
    item.supplierName = payload.supplierName ?? item.supplierName;
    item.storageLocation = payload.storageLocation ?? item.storageLocation;
    const saved = await item.save();

    const batch = await this.batchModel.create({
      locationId: saved.locationId,
      stockItemId: saved._id.toString(),
      stockItemName: saved.name,
      unit: saved.unit,
      batchNumber: payload.batchNumber,
      initialQuantity: payload.quantity,
      remainingQuantity: payload.quantity,
      unitPriceNet,
      supplierId: payload.supplierId ?? saved.supplierId,
      supplierName: payload.supplierName ?? saved.supplierName,
      storageLocation: payload.storageLocation ?? saved.storageLocation,
      receivedAt,
      expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : undefined,
      note: payload.note,
      isActive: true,
    });

    const movement = await this.movementModel.create({
      locationId: saved.locationId,
      stockItemId: saved._id.toString(),
      batchId: batch._id.toString(),
      stockItemName: saved.name,
      type: StockMovementType.Receipt,
      quantityChange: payload.quantity,
      quantityBefore,
      quantityAfter: saved.quantity,
      note: payload.note,
      supplierId: payload.supplierId ?? saved.supplierId,
      supplierName: payload.supplierName ?? saved.supplierName,
      unitPriceNet,
      valueNet: payload.quantity * unitPriceNet,
      actorId: actor.sub,
    });

    await this.syncLowStockAlert(saved);
    await this.syncExpiryAlert(batch);
    const event = {
      type: 'adjusted' as const,
      item: this.toItemResponse(saved),
      movement: this.toMovementResponse(movement),
      batch: this.toBatchResponse(batch),
    };
    this.stockEvents$.next(event);
    return event;
  }

  async reportWaste(
    payload: ReportWasteDto,
    actor: AuthenticatedUser,
  ): Promise<StockEvent> {
    const allowed = [
      StockMovementType.Shrinkage,
      StockMovementType.Spoilage,
      StockMovementType.Breakage,
      StockMovementType.Loss,
    ];

    if (!allowed.includes(payload.type)) {
      throw new BadRequestException(
        'Nur Schwund, Verderb, Bruch oder Verlust sind erlaubt',
      );
    }

    if (!payload.reason?.trim()) {
      throw new BadRequestException('Grund ist erforderlich');
    }

    return this.adjust(
      payload.stockItemId,
      {
        quantityChange: -Math.abs(payload.quantity),
        type: payload.type,
        reason: payload.reason,
        note: payload.note,
        batchId: payload.batchId,
      },
      actor,
    );
  }

  async reorderSuggestions(actor: AuthenticatedUser, locationId?: string) {
    const items = await this.findAll(actor, locationId);
    const lowItems = items.filter(
      (item) =>
        item.isActive && !item.isArchived && item.quantity <= item.minQuantity,
    );
    const grouped = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        lines: Array<{
          stockItemId: string;
          stockItemName: string;
          quantity: number;
          unit: string;
          unitPriceNet: number;
          totalNet: number;
          currentQuantity: number;
          minQuantity: number;
          targetQuantity: number;
        }>;
        totalNet: number;
      }
    >();

    for (const item of lowItems) {
      const targetQuantity =
        item.targetQuantity ??
        Math.max(item.minQuantity * 2, item.minQuantity + 1);
      const quantity = Math.max(0, targetQuantity - item.quantity);
      const supplierId = item.supplierId ?? 'unassigned';
      const supplierName = item.supplierName ?? 'Ohne Lieferant';
      const group = grouped.get(supplierId) ?? {
        supplierId,
        supplierName,
        lines: [],
        totalNet: 0,
      };
      const totalNet = quantity * item.purchasePriceNet;
      group.lines.push({
        stockItemId: item._id,
        stockItemName: item.name,
        quantity,
        unit: item.unit,
        unitPriceNet: item.purchasePriceNet,
        totalNet,
        currentQuantity: item.quantity,
        minQuantity: item.minQuantity,
        targetQuantity,
      });
      group.totalNet += totalNet;
      grouped.set(supplierId, group);
    }

    return Array.from(grouped.values()).sort((a, b) =>
      a.supplierName.localeCompare(b.supplierName),
    );
  }

  async listPurchaseOrders(actor: AuthenticatedUser, locationId?: string) {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);
    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );

    return this.purchaseOrderModel
      .find({ locationId: { $in: locationIds } })
      .sort({ createdAt: -1 })
      .exec();
  }

  async createPurchaseOrder(
    payload: CreatePurchaseOrderDto,
    actor: AuthenticatedUser,
  ) {
    await this.assertCanUseLocation(actor, payload.locationId);

    if (!payload.lines.length) {
      throw new BadRequestException(
        'Bestellung benoetigt mindestens eine Position',
      );
    }

    const lines = [];
    for (const line of payload.lines) {
      const item = await this.stockItemModel.findById(line.stockItemId).exec();
      if (!item || item.locationId !== payload.locationId) {
        throw new NotFoundException('Nachbestellartikel nicht gefunden');
      }
      const unitPriceNet = item.purchasePriceNet ?? 0;
      lines.push({
        stockItemId: item._id.toString(),
        stockItemName: item.name,
        quantity: line.quantity,
        unit: item.unit,
        unitPriceNet,
        totalNet: line.quantity * unitPriceNet,
      });
    }

    const totalNet = lines.reduce((sum, line) => sum + line.totalNet, 0);
    const order = await this.purchaseOrderModel.create({
      companyId: actor.companyId,
      locationId: payload.locationId,
      supplierId: payload.supplierId,
      supplierName: payload.supplierName ?? 'Lieferant',
      orderNumber: await this.nextPurchaseOrderNumber(payload.locationId),
      status: PurchaseOrderStatus.Draft,
      lines,
      totalNet,
      note: payload.note,
      createdBy: actor.sub,
    });

    return order;
  }

  async findLocations(actor: AuthenticatedUser, locationId?: string) {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);
    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );
    const locations = await this.inventoryLocationModel
      .find({ locationId: { $in: locationIds } })
      .sort({ name: 1 })
      .exec();
    return locations.map((location) =>
      this.toInventoryLocationResponse(location),
    );
  }

  async createLocation(
    payload: CreateInventoryLocationDto,
    actor: AuthenticatedUser,
  ) {
    await this.assertCanUseLocation(actor, payload.locationId);
    const location = await this.inventoryLocationModel.create({
      ...payload,
      isActive: payload.isActive ?? true,
      isArchived: payload.isArchived ?? false,
    });
    return this.toInventoryLocationResponse(location);
  }

  async updateLocation(
    id: string,
    payload: Partial<CreateInventoryLocationDto>,
    actor: AuthenticatedUser,
  ) {
    const location = await this.inventoryLocationModel.findById(id).exec();
    if (!location) throw new NotFoundException('Lagerort nicht gefunden');
    await this.assertCanUseLocation(actor, location.locationId);
    if (payload.locationId && payload.locationId !== location.locationId) {
      await this.assertCanUseLocation(actor, payload.locationId);
    }
    location.set(payload);
    return this.toInventoryLocationResponse(await location.save());
  }

  async removeLocation(id: string, actor: AuthenticatedUser) {
    const location = await this.inventoryLocationModel.findById(id).exec();
    if (!location) throw new NotFoundException('Lagerort nicht gefunden');
    await this.assertCanUseLocation(actor, location.locationId);
    location.isArchived = true;
    location.isActive = false;
    return this.toInventoryLocationResponse(await location.save());
  }

  async findCategories() {
    const categories = await this.inventoryCategoryModel
      .find()
      .sort({ name: 1 })
      .exec();
    return categories.map((category) =>
      this.toInventoryCategoryResponse(category),
    );
  }

  async createCategory(payload: CreateInventoryCategoryDto) {
    const category = await this.inventoryCategoryModel.create({
      ...payload,
      isActive: payload.isActive ?? true,
      isArchived: payload.isArchived ?? false,
    });
    return this.toInventoryCategoryResponse(category);
  }

  async updateCategory(
    id: string,
    payload: Partial<CreateInventoryCategoryDto>,
  ) {
    const category = await this.inventoryCategoryModel.findById(id).exec();
    if (!category) throw new NotFoundException('Kategorie nicht gefunden');
    category.set(payload);
    return this.toInventoryCategoryResponse(await category.save());
  }

  async removeCategory(id: string) {
    const category = await this.inventoryCategoryModel.findById(id).exec();
    if (!category) throw new NotFoundException('Kategorie nicht gefunden');
    category.isArchived = true;
    category.isActive = false;
    return this.toInventoryCategoryResponse(await category.save());
  }

  async findAlerts(actor: AuthenticatedUser, locationId?: string) {
    await this.refreshAlerts(actor, locationId);
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);
    const alerts = await this.stockAlertModel
      .find({ locationId: { $in: locationIds }, isResolved: false })
      .sort({ createdAt: -1 })
      .exec();
    return alerts.map((alert) => this.toAlertResponse(alert));
  }

  async dashboard(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<InventoryDashboardResponse> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);
    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );
    await this.refreshAlerts(actor, locationId);
    const items = await this.stockItemModel
      .find({ locationId: { $in: locationIds }, isArchived: { $ne: true } })
      .exec();
    const expiringSoonCount = await this.batchModel.countDocuments({
      locationId: { $in: locationIds },
      isActive: true,
      remainingQuantity: { $gt: 0 },
      expiresAt: { $lte: this.daysFromNow(7) },
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const movements = await this.movementModel
      .find({ locationId: { $in: locationIds }, createdAt: { $gte: today } })
      .exec();
    const openInventorySessions =
      await this.inventorySessionModel.countDocuments({
        locationId: { $in: locationIds },
        status: InventorySessionStatus.Open,
      });
    const topUsage = await this.movementModel.aggregate<{
      _id: string;
      name: string;
      quantity: number;
    }>([
      {
        $match: {
          locationId: { $in: locationIds },
          type: {
            $in: [
              StockMovementType.Usage,
              StockMovementType.Issue,
              StockMovementType.OrderConsumption,
              StockMovementType.OrderQuantityAdjustment,
            ],
          },
          quantityChange: { $lt: 0 },
        },
      },
      {
        $group: {
          _id: '$stockItemId',
          name: { $first: '$stockItemName' },
          quantity: { $sum: { $abs: '$quantityChange' } },
        },
      },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
    ]);
    const sumMovement = (types: StockMovementType[]) =>
      movements
        .filter((movement) => types.includes(movement.type))
        .reduce((sum, movement) => sum + Math.abs(movement.quantityChange), 0);

    return {
      itemCount: items.length,
      totalStockValueNet: items.reduce(
        (sum, item) => sum + item.quantity * (item.purchasePriceNet ?? 0),
        0,
      ),
      lowStockCount: items.filter(
        (item) => item.isActive && item.quantity <= item.minQuantity,
      ).length,
      openInventorySessions,
      receiptsToday: sumMovement([StockMovementType.Receipt]),
      issuesToday: sumMovement([
        StockMovementType.Issue,
        StockMovementType.Usage,
        StockMovementType.OrderConsumption,
        StockMovementType.OrderQuantityAdjustment,
      ]),
      shrinkageToday: sumMovement([
        StockMovementType.Shrinkage,
        StockMovementType.Breakage,
        StockMovementType.Spoilage,
        StockMovementType.Loss,
      ]),
      expiringSoonCount,
      negativeStockCount: items.filter((item) => item.quantity < 0).length,
      topUsageItems: topUsage.map((entry) => ({
        stockItemId: entry._id,
        name: entry.name,
        quantity: entry.quantity,
      })),
    };
  }

  async startInventory(
    payload: StartInventorySessionDto,
    actor: AuthenticatedUser,
  ) {
    await this.assertCanUseLocation(actor, payload.locationId);
    const session = await this.inventorySessionModel.create({
      locationId: payload.locationId,
      status: InventorySessionStatus.Open,
      startedBy: actor.sub,
      startedAt: new Date(),
      note: payload.note,
    });
    return this.toInventorySessionResponse(session);
  }

  async listInventorySessions(actor: AuthenticatedUser, locationId?: string) {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);
    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );
    const sessions = await this.inventorySessionModel
      .find({ locationId: { $in: locationIds } })
      .sort({ startedAt: -1 })
      .exec();
    return sessions.map((session) => this.toInventorySessionResponse(session));
  }

  async completeInventory(
    id: string,
    payload: CompleteInventorySessionDto,
    actor: AuthenticatedUser,
  ) {
    const session = await this.inventorySessionModel.findById(id).exec();
    if (!session) throw new NotFoundException('Inventur nicht gefunden');
    if (session.status === InventorySessionStatus.Closed) {
      throw new BadRequestException('Inventur ist bereits abgeschlossen');
    }
    await this.assertCanUseLocation(actor, session.locationId);
    const counts = [];
    for (const line of payload.counts) {
      const item = await this.stockItemModel.findById(line.stockItemId).exec();
      if (!item) throw new NotFoundException('Inventurartikel nicht gefunden');
      await this.assertCanUseLocation(actor, item.locationId);
      const quantityBefore = item.quantity;
      const difference = line.countedQuantity - quantityBefore;
      if (difference !== 0 && !payload.note?.trim()) {
        throw new BadRequestException(
          'Inventurabweichungen benoetigen eine Pflichtnotiz',
        );
      }
      item.quantity = line.countedQuantity;
      await item.save();
      const unitPriceNet = item.purchasePriceNet ?? 0;
      const count = await this.inventoryCountModel.findOneAndUpdate(
        { sessionId: id, stockItemId: item._id.toString() },
        {
          sessionId: id,
          stockItemId: item._id.toString(),
          stockItemName: item.name,
          expectedQuantity: quantityBefore,
          countedQuantity: line.countedQuantity,
          difference,
          differenceValue: difference * unitPriceNet,
        },
        { upsert: true, returnDocument: 'after' },
      );
      counts.push(count);
      await this.movementModel.create({
        locationId: item.locationId,
        stockItemId: item._id.toString(),
        stockItemName: item.name,
        type: 'Inventur',
        quantityChange: difference,
        quantityBefore,
        quantityAfter: item.quantity,
        note: payload.note,
        reason: difference !== 0 ? 'Inventurdifferenz' : undefined,
        unitPriceNet,
        valueNet: Math.abs(difference) * unitPriceNet,
        actorId: actor.sub,
      });
      await this.syncLowStockAlert(item);
    }
    session.status = InventorySessionStatus.Closed;
    session.completedBy = actor.sub;
    session.completedAt = new Date();
    session.note = payload.note ?? session.note;
    await session.save();
    return {
      session: this.toInventorySessionResponse(session),
      counts: counts.map((count) => this.toInventoryCountResponse(count)),
    };
  }

  async report(actor: AuthenticatedUser, locationId?: string) {
    const [dashboard, items, movements, alerts, sessions] = await Promise.all([
      this.dashboard(actor, locationId),
      this.findAll(actor, locationId),
      this.findMovements(actor, locationId),
      this.findAlerts(actor, locationId),
      this.listInventorySessions(actor, locationId),
    ]);
    return { dashboard, items, movements, alerts, sessions };
  }

  async update(
    id: string,
    payload: UpdateStockItemDto,
    actor: AuthenticatedUser,
  ): Promise<StockItemResponse> {
    const item = await this.stockItemModel.findById(id).exec();

    if (!item) {
      throw new NotFoundException('Lagerartikel nicht gefunden');
    }

    await this.assertCanUseLocation(actor, item.locationId);

    if (payload.locationId && payload.locationId !== item.locationId) {
      await this.assertCanUseLocation(actor, payload.locationId);
    }

    item.set(payload);
    const saved = await item.save();
    await this.syncLowStockAlert(saved);
    const response = this.toItemResponse(saved);
    this.stockEvents$.next({ type: 'updated', item: response });
    return response;
  }

  async adjust(
    id: string,
    payload: AdjustStockDto,
    actor: AuthenticatedUser,
  ): Promise<StockEvent> {
    const item = await this.stockItemModel.findById(id).exec();

    if (!item) {
      throw new NotFoundException('Lagerartikel nicht gefunden');
    }

    await this.assertCanUseLocation(actor, item.locationId);

    const quantityBefore = item.quantity;
    const nextQuantity = item.quantity + payload.quantityChange;

    if (
      payload.quantityChange < 0 &&
      [
        StockMovementType.Shrinkage,
        StockMovementType.Spoilage,
        StockMovementType.Breakage,
        StockMovementType.Loss,
      ].includes(payload.type) &&
      !payload.reason?.trim()
    ) {
      throw new BadRequestException(
        'Grund ist fuer Schwund, Verderb, Bruch und Verlust erforderlich',
      );
    }

    item.quantity = nextQuantity;
    const saved = await item.save();
    const unitPriceNet = payload.unitPriceNet ?? saved.purchasePriceNet ?? 0;
    const batchIds =
      payload.quantityChange < 0
        ? await this.consumeBatches(
            saved._id.toString(),
            Math.abs(payload.quantityChange),
            payload.batchId,
          )
        : [];
    const movement = await this.movementModel.create({
      locationId: saved.locationId,
      stockItemId: saved._id.toString(),
      batchId: batchIds.join(',') || payload.batchId,
      stockItemName: saved.name,
      type: payload.type,
      quantityChange: payload.quantityChange,
      quantityBefore,
      quantityAfter: saved.quantity,
      note: payload.note,
      reason: payload.reason,
      supplierId: payload.supplierId ?? saved.supplierId,
      supplierName: payload.supplierName ?? saved.supplierName,
      unitPriceNet,
      valueNet: Math.abs(payload.quantityChange) * unitPriceNet,
      actorId: actor.sub,
    });
    await this.syncLowStockAlert(saved);
    const event = {
      type: 'adjusted' as const,
      item: this.toItemResponse(saved),
      movement: this.toMovementResponse(movement),
    };

    this.stockEvents$.next(event);
    return event;
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<StockItemResponse> {
    const item = await this.stockItemModel.findById(id).exec();

    if (!item) {
      throw new NotFoundException('Lagerartikel nicht gefunden');
    }

    await this.assertCanUseLocation(actor, item.locationId);
    await this.stockItemModel.deleteOne({ _id: id }).exec();

    const response = this.toItemResponse(item);
    this.stockEvents$.next({ type: 'deleted', item: response });
    return response;
  }

  stream(actor: AuthenticatedUser): Observable<MessageEvent> {
    return from(this.getReadableLocationIds(actor)).pipe(
      switchMap((locationIds) =>
        this.stockEvents$.pipe(
          filter((event) => locationIds.includes(event.item.locationId)),
          map((event) => ({ data: event }) as MessageEvent),
        ),
      ),
    );
  }

  private async assertCanUseLocation(
    actor: AuthenticatedUser,
    locationId: string,
  ): Promise<void> {
    await this.accessPolicy.assertCanAccessLocation(actor, locationId);
  }

  private async getReadableLocationIds(
    actor: AuthenticatedUser,
  ): Promise<string[]> {
    return this.accessPolicy.getReadableLocationIds(actor);
  }

  private async getManagedLocationIds(managerId: string): Promise<string[]> {
    const locations = await this.locationModel
      .find({ managerId })
      .select('_id')
      .exec();

    return locations.map((location) => location._id.toString());
  }

  private async refreshAlerts(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<void> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);
    const items = await this.stockItemModel
      .find({ locationId: { $in: locationIds }, isArchived: { $ne: true } })
      .exec();
    await Promise.all(items.map((item) => this.syncLowStockAlert(item)));
    const batches = await this.batchModel
      .find({
        locationId: { $in: locationIds },
        isActive: true,
        remainingQuantity: { $gt: 0 },
      })
      .exec();
    await Promise.all(batches.map((batch) => this.syncExpiryAlert(batch)));
  }

  private async syncLowStockAlert(item: StockItemDocument): Promise<void> {
    const stockItemId = item._id.toString();
    if (
      item.isActive &&
      !item.isArchived &&
      item.quantity <= item.minQuantity
    ) {
      await this.stockAlertModel.findOneAndUpdate(
        { stockItemId, type: 'Mindestbestand', isResolved: false },
        {
          locationId: item.locationId,
          stockItemId,
          stockItemName: item.name,
          type: 'Mindestbestand',
          message: `${item.name} liegt mit ${item.quantity} ${item.unit} am oder unter dem Mindestbestand von ${item.minQuantity} ${item.unit}.`,
          severity:
            item.quantity <= (item.criticalQuantity ?? 0) || item.quantity < 0
              ? 'critical'
              : 'warning',
          isResolved: false,
        },
        { upsert: true, returnDocument: 'after' },
      );
      return;
    }

    await this.stockAlertModel
      .updateMany(
        { stockItemId, type: 'Mindestbestand', isResolved: false },
        { isResolved: true },
      )
      .exec();
  }

  private async syncExpiryAlert(batch: InventoryBatchDocument): Promise<void> {
    const batchId = batch._id.toString();
    const daysUntilExpiry = this.daysUntil(batch.expiresAt);

    if (
      batch.isActive &&
      batch.remainingQuantity > 0 &&
      daysUntilExpiry !== undefined &&
      daysUntilExpiry <= 7
    ) {
      await this.stockAlertModel.findOneAndUpdate(
        {
          stockItemId: batch.stockItemId,
          type: `MHD:${batchId}`,
          isResolved: false,
        },
        {
          locationId: batch.locationId,
          stockItemId: batch.stockItemId,
          stockItemName: batch.stockItemName,
          type: `MHD:${batchId}`,
          message: `${batch.stockItemName} Charge ${batch.batchNumber ?? batchId} laeuft in ${daysUntilExpiry} Tagen ab.`,
          severity: daysUntilExpiry <= 2 ? 'critical' : 'warning',
          isResolved: false,
        },
        { upsert: true, returnDocument: 'after' },
      );
      return;
    }

    await this.stockAlertModel
      .updateMany(
        {
          stockItemId: batch.stockItemId,
          type: `MHD:${batchId}`,
          isResolved: false,
        },
        { isResolved: true },
      )
      .exec();
  }

  private async consumeBatches(
    stockItemId: string,
    quantity: number,
    preferredBatchId?: string,
  ): Promise<string[]> {
    let remaining = quantity;
    const usedBatchIds: string[] = [];
    const query = {
      stockItemId,
      isActive: true,
      remainingQuantity: { $gt: 0 },
      ...(preferredBatchId ? { _id: preferredBatchId } : {}),
    };
    const batches = await this.batchModel
      .find(query)
      .sort({ expiresAt: 1, receivedAt: 1 })
      .exec();

    for (const batch of batches) {
      if (remaining <= 0) break;
      const consumed = Math.min(batch.remainingQuantity, remaining);
      batch.remainingQuantity -= consumed;
      batch.isActive = batch.remainingQuantity > 0;
      await batch.save();
      await this.syncExpiryAlert(batch);
      usedBatchIds.push(batch._id.toString());
      remaining -= consumed;
    }

    if (remaining > 0 && preferredBatchId) {
      return usedBatchIds;
    }

    if (remaining > 0 && !preferredBatchId) {
      return usedBatchIds;
    }

    return usedBatchIds;
  }

  private daysFromNow(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  private daysUntil(value?: Date): number | undefined {
    if (!value) {
      return undefined;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  }

  private toItemResponse(item: StockItemDocument): StockItemResponse {
    const timestamped = item as StockItemDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };

    return {
      _id: item._id.toString(),
      articleNumber: item.articleNumber,
      locationId: item.locationId,
      name: item.name,
      description: item.description,
      category: item.category,
      unit: item.unit,
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      criticalQuantity: item.criticalQuantity ?? 0,
      targetQuantity: item.targetQuantity,
      supplierId: item.supplierId,
      supplierName: item.supplierName,
      ean: item.ean,
      purchasePriceNet: item.purchasePriceNet ?? 0,
      purchasePriceGross: item.purchasePriceGross ?? 0,
      salePrice: item.salePrice ?? 0,
      vatRate: item.vatRate ?? 19,
      storageLocation: item.storageLocation,
      requiresExpiryDate: item.requiresExpiryDate ?? false,
      ingredientCategory: item.ingredientCategory,
      note: item.note,
      isActive: item.isActive,
      isArchived: item.isArchived ?? false,
      lowStock:
        item.isActive && !item.isArchived && item.quantity <= item.minQuantity,
      stockValueNet: item.quantity * (item.purchasePriceNet ?? 0),
      criticalStock:
        item.isActive &&
        !item.isArchived &&
        item.quantity <= (item.criticalQuantity ?? 0),
      negativeStock: item.quantity < 0,
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }

  private toMovementResponse(
    movement: StockMovementDocument,
  ): StockMovementResponse {
    const timestamped = movement as StockMovementDocument & {
      createdAt?: Date;
    };

    return {
      _id: movement._id.toString(),
      tenantId: movement.tenantId,
      locationId: movement.locationId,
      stockItemId: movement.stockItemId,
      batchId: movement.batchId,
      orderId: movement.orderId,
      orderItemId: movement.orderItemId,
      recipeId: movement.recipeId,
      menuItemId: movement.menuItemId,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      stockItemName: movement.stockItemName,
      type: movement.type,
      quantityChange: movement.quantityChange,
      quantity: movement.quantity ?? Math.abs(movement.quantityChange),
      unit: movement.unit,
      quantityBefore:
        movement.quantityBefore ??
        Math.max(0, movement.quantityAfter - movement.quantityChange),
      quantityAfter: movement.quantityAfter,
      note: movement.note,
      reason: movement.reason,
      supplierId: movement.supplierId,
      supplierName: movement.supplierName,
      unitPriceNet: movement.unitPriceNet ?? 0,
      valueNet: movement.valueNet ?? 0,
      actorId: movement.actorId,
      createdAt: timestamped.createdAt?.toISOString(),
    };
  }

  private toInventoryLocationResponse(location: InventoryLocationDocument) {
    const timestamped = location as InventoryLocationDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    return {
      _id: location._id.toString(),
      locationId: location.locationId,
      name: location.name,
      description: location.description,
      isActive: location.isActive,
      isArchived: location.isArchived,
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }

  private toInventoryCategoryResponse(category: InventoryCategoryDocument) {
    const timestamped = category as InventoryCategoryDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    return {
      _id: category._id.toString(),
      name: category.name,
      description: category.description,
      isActive: category.isActive,
      isArchived: category.isArchived,
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }

  private toAlertResponse(alert: StockAlertDocument) {
    const timestamped = alert as StockAlertDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    return {
      _id: alert._id.toString(),
      locationId: alert.locationId,
      stockItemId: alert.stockItemId,
      stockItemName: alert.stockItemName,
      type: alert.type,
      message: alert.message,
      severity: alert.severity,
      isResolved: alert.isResolved,
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }

  private toInventorySessionResponse(session: InventorySessionDocument) {
    const timestamped = session as InventorySessionDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    return {
      _id: session._id.toString(),
      locationId: session.locationId,
      status: session.status,
      startedBy: session.startedBy,
      completedBy: session.completedBy,
      startedAt: session.startedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      note: session.note,
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }

  private toInventoryCountResponse(count: InventoryCountDocument) {
    return {
      _id: count._id.toString(),
      sessionId: count.sessionId,
      stockItemId: count.stockItemId,
      stockItemName: count.stockItemName,
      expectedQuantity: count.expectedQuantity,
      countedQuantity: count.countedQuantity,
      difference: count.difference,
      differenceValue: count.differenceValue,
    };
  }

  private toBatchResponse(
    batch: InventoryBatchDocument,
  ): InventoryBatchResponse {
    const timestamped = batch as InventoryBatchDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    const daysUntilExpiry = this.daysUntil(batch.expiresAt);
    return {
      _id: batch._id.toString(),
      locationId: batch.locationId,
      stockItemId: batch.stockItemId,
      stockItemName: batch.stockItemName,
      unit: batch.unit,
      batchNumber: batch.batchNumber,
      initialQuantity: batch.initialQuantity,
      remainingQuantity: batch.remainingQuantity,
      unitPriceNet: batch.unitPriceNet ?? 0,
      supplierId: batch.supplierId,
      supplierName: batch.supplierName,
      storageLocation: batch.storageLocation,
      receivedAt:
        batch.receivedAt?.toISOString() ?? timestamped.createdAt?.toISOString(),
      expiresAt: batch.expiresAt?.toISOString(),
      note: batch.note,
      isActive: batch.isActive,
      daysUntilExpiry,
      expiringSoon: daysUntilExpiry !== undefined && daysUntilExpiry <= 7,
    };
  }

  private async nextPurchaseOrderNumber(locationId: string): Promise<string> {
    const count = await this.purchaseOrderModel
      .countDocuments({ locationId })
      .exec();
    return `PO-${String(count + 1).padStart(5, '0')}`;
  }
}
