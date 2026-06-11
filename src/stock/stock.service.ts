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
import { CreateReorderPurchaseOrderDto } from './dto/create-reorder-purchase-order.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import {
  CompleteInventorySessionDto,
  StartInventorySessionDto,
} from './dto/inventory-session.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { ReportWasteDto } from './dto/report-waste.dto';
import {
  CreateSupplierPriceDto,
  UpdateSupplierPriceDto,
} from './dto/supplier-price.dto';
import { UpdatePurchaseOrderStatusDto } from './dto/update-purchase-order-status.dto';
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
import {
  StockItem,
  StockItemDocument,
  StockSupplierPrice,
} from './schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementDocument,
  StockMovementType,
} from './schemas/stock-movement.schema';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderLine,
  PurchaseOrderStatus,
} from './schemas/purchase-order.schema';
import {
  Supplier,
  SupplierDocument,
} from '../suppliers/schemas/supplier.schema';
import {
  calculateStockValueNet,
  calculateWeightedAveragePurchasePrice,
  createValuationWarnings,
  resolveValuationUnitCost,
  roundMoney,
} from './stock-valuation';
import {
  calculateSupplierPriceDifference,
  findDuplicateSupplierPrice,
  getCheapestSupplierPrice,
  getPreferredSupplierPrice,
} from './supplier-price-utils';

export interface SupplierPriceResponse {
  supplierId: string;
  supplierName?: string;
  unitPriceNet: number;
  currency: string;
  unit: string;
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
  isPreferred: boolean;
  lastPurchasedAt?: string;
  lastPurchasePriceNet?: number;
  notes?: string;
  updatedAt?: string;
}

export interface StockItemResponse {
  _id: string;
  tenantId?: string;
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
  lastPurchasePrice: number;
  averageCost: number;
  averagePurchasePrice: number;
  unitCost: number;
  currency: string;
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
  valuationWarnings: string[];
  supplierPrices: SupplierPriceResponse[];
  preferredSupplierPrice?: SupplierPriceResponse;
  cheapestSupplierPrice?: SupplierPriceResponse;
  supplierPriceDifferenceNet?: number;
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
  extraId?: string;
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
  unitCost: number;
  totalValueNet: number;
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
  missingPriceCount: number;
  valuationWarnings: string[];
  lowStockCount: number;
  openInventorySessions: number;
  receiptsToday: number;
  issuesToday: number;
  shrinkageToday: number;
  expiringSoonCount: number;
  negativeStockCount: number;
  topUsageItems: Array<{ stockItemId: string; name: string; quantity: number }>;
}

export interface PurchaseOrderLineResponse {
  _id: string;
  stockItemId: string;
  stockItemName: string;
  quantity: number;
  unit: string;
  expectedUnitCost: number;
  unitPriceNet: number;
  totalNet: number;
  receivedQuantity: number;
  openQuantity: number;
}

export interface PurchaseOrderResponse {
  _id: string;
  tenantId?: string;
  companyId?: string;
  locationId: string;
  supplierId: string;
  supplierName: string;
  orderNumber: string;
  status: PurchaseOrderStatus;
  lines: PurchaseOrderLineResponse[];
  totalNet: number;
  expectedDeliveryDate?: string;
  note?: string;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ReorderSuggestionStrategy = 'preferred' | 'cheapest';

export interface ReorderSuggestionItemResponse {
  stockItemId: string;
  stockItemName: string;
  currentStock: number;
  minimumStock: number;
  targetStock?: number;
  unit: string;
  openPurchaseQuantity: number;
  suggestedQuantity: number;
  supplierId?: string;
  supplierName?: string;
  unitPriceNet?: number;
  currency?: string;
  estimatedTotalNet?: number;
  warnings: string[];
}

export interface ReorderSuggestionsResponse {
  summary: {
    totalItems: number;
    suggestedItems: number;
    coveredItems: number;
    warningCount: number;
    estimatedTotalNet: number;
  };
  items: ReorderSuggestionItemResponse[];
}

export interface ProcurementDashboardResponse {
  summary: {
    openOrders: number;
    partiallyReceivedOrders: number;
    overdueOrders: number;
    openOrderValueNet: number;
    receiptsToday: number;
    criticalStockItems: number;
    reorderSuggestions: number;
    purchaseVolumeNet: number;
    receiptValueNet: number;
  };
  purchaseOrders: Array<
    PurchaseOrderResponse & {
      openQuantity: number;
      locationName?: string;
      isOverdue: boolean;
    }
  >;
  receipts: Array<
    StockMovementResponse & {
      purchaseOrderNumber?: string;
      locationName?: string;
    }
  >;
  supplierRanking: Array<{
    supplierId: string;
    supplierName: string;
    orderCount: number;
    purchaseValueNet: number;
    openOrders: number;
    lastPurchaseAt?: string;
  }>;
  reorderSuggestions: ReorderSuggestionItemResponse[];
  warnings: Array<{
    type:
      | 'overdue_order'
      | 'missing_supplier'
      | 'missing_supplier_price'
      | 'critical_stock'
      | 'missing_purchase_price';
    message: string;
    severity: 'warning' | 'critical';
    stockItemId?: string;
    purchaseOrderId?: string;
    supplierId?: string;
    locationId?: string;
  }>;
  filters: {
    locationIds: string[];
    range: 'today' | 'week' | 'month' | 'custom';
    dateFrom: string;
    dateTo: string;
  };
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
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
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
    const initialUnitCost =
      payload.averageCost ??
      payload.unitCost ??
      payload.lastPurchasePrice ??
      payload.purchasePriceNet ??
      0;
    const initialPurchasePrice =
      payload.purchasePriceNet ?? payload.lastPurchasePrice ?? initialUnitCost;

    const item = await this.stockItemModel.create({
      ...payload,
      tenantId: actor.tenantId,
      purchasePriceNet: initialPurchasePrice,
      lastPurchasePrice: payload.lastPurchasePrice ?? initialPurchasePrice,
      averageCost: payload.averageCost ?? initialUnitCost,
      unitCost: payload.unitCost ?? initialUnitCost,
      currency: payload.currency ?? 'EUR',
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

  async listSupplierPrices(
    stockItemId: string,
    actor: AuthenticatedUser,
  ): Promise<SupplierPriceResponse[]> {
    const item = await this.findStockItemForActor(stockItemId, actor);
    return this.toSupplierPriceResponses(item.supplierPrices ?? []);
  }

  async addSupplierPrice(
    stockItemId: string,
    payload: CreateSupplierPriceDto,
    actor: AuthenticatedUser,
  ): Promise<StockItemResponse> {
    const item = await this.findStockItemForActor(stockItemId, actor);
    const supplier = await this.assertSupplierForLocation(
      payload.supplierId,
      item.locationId,
    );
    const unit = payload.unit.trim();
    const prices = item.supplierPrices ?? [];
    if (findDuplicateSupplierPrice(prices, supplier._id.toString(), unit)) {
      throw new BadRequestException(
        'Lieferantenpreis fuer Lieferant und Einheit existiert bereits',
      );
    }

    const supplierPrice: StockSupplierPrice = {
      supplierId: supplier._id.toString(),
      supplierName: supplier.name,
      unitPriceNet: roundMoney(payload.unitPriceNet),
      currency: (payload.currency ?? item.currency ?? 'EUR').toUpperCase(),
      unit,
      minimumOrderQuantity: payload.minimumOrderQuantity,
      leadTimeDays: payload.leadTimeDays,
      isPreferred: payload.isPreferred ?? false,
      notes: payload.notes,
      updatedAt: new Date(),
    };

    if (supplierPrice.isPreferred) {
      prices.forEach((price) => {
        price.isPreferred = false;
      });
      item.supplierId = supplierPrice.supplierId;
      item.supplierName = supplierPrice.supplierName;
    }

    item.supplierPrices = [...prices, supplierPrice];
    const saved = await item.save();
    return this.toItemResponse(saved);
  }

  async updateSupplierPrice(
    stockItemId: string,
    supplierId: string,
    payload: UpdateSupplierPriceDto,
    actor: AuthenticatedUser,
  ): Promise<StockItemResponse> {
    const item = await this.findStockItemForActor(stockItemId, actor);
    const prices = item.supplierPrices ?? [];
    const index = prices.findIndex((price) => price.supplierId === supplierId);
    if (index < 0) {
      throw new NotFoundException('Lieferantenpreis nicht gefunden');
    }

    await this.assertSupplierForLocation(supplierId, item.locationId);
    const current = prices[index];
    const nextUnit = payload.unit?.trim() || current.unit;
    if (findDuplicateSupplierPrice(prices, supplierId, nextUnit, index)) {
      throw new BadRequestException(
        'Lieferantenpreis fuer Lieferant und Einheit existiert bereits',
      );
    }

    if (payload.unitPriceNet !== undefined) {
      current.unitPriceNet = roundMoney(payload.unitPriceNet);
    }
    if (payload.currency !== undefined) {
      current.currency = payload.currency.toUpperCase();
    }
    current.unit = nextUnit;
    if ('minimumOrderQuantity' in payload) {
      current.minimumOrderQuantity = payload.minimumOrderQuantity;
    }
    if ('leadTimeDays' in payload) {
      current.leadTimeDays = payload.leadTimeDays;
    }
    if ('notes' in payload) {
      current.notes = payload.notes;
    }
    current.updatedAt = new Date();

    if (payload.isPreferred === true) {
      prices.forEach((price) => {
        price.isPreferred = false;
      });
      current.isPreferred = true;
      item.supplierId = current.supplierId;
      item.supplierName = current.supplierName;
    } else if (payload.isPreferred === false) {
      current.isPreferred = false;
    }

    item.supplierPrices = prices;
    const saved = await item.save();
    return this.toItemResponse(saved);
  }

  async deleteSupplierPrice(
    stockItemId: string,
    supplierId: string,
    actor: AuthenticatedUser,
  ): Promise<StockItemResponse> {
    const item = await this.findStockItemForActor(stockItemId, actor);
    const prices = item.supplierPrices ?? [];
    const nextPrices = prices.filter((price) => price.supplierId !== supplierId);
    if (nextPrices.length === prices.length) {
      throw new NotFoundException('Lieferantenpreis nicht gefunden');
    }
    if (item.supplierId === supplierId) {
      const nextPreferred = getPreferredSupplierPrice(nextPrices);
      item.supplierId = nextPreferred?.supplierId;
      item.supplierName = nextPreferred?.supplierName;
    }
    item.supplierPrices = nextPrices;
    const saved = await item.save();
    return this.toItemResponse(saved);
  }

  async preferSupplierPrice(
    stockItemId: string,
    supplierId: string,
    actor: AuthenticatedUser,
  ): Promise<StockItemResponse> {
    const item = await this.findStockItemForActor(stockItemId, actor);
    const prices = item.supplierPrices ?? [];
    const preferred = prices.find((price) => price.supplierId === supplierId);
    if (!preferred) {
      throw new NotFoundException('Lieferantenpreis nicht gefunden');
    }
    await this.assertSupplierForLocation(supplierId, item.locationId);
    prices.forEach((price) => {
      price.isPreferred = price.supplierId === supplierId;
      if (price.isPreferred) {
        price.updatedAt = new Date();
      }
    });
    item.supplierId = preferred.supplierId;
    item.supplierName = preferred.supplierName;
    item.supplierPrices = prices;
    const saved = await item.save();
    return this.toItemResponse(saved);
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
    this.assertTenantMatch(actor, item.tenantId, 'Lagerartikel');

    if (item.requiresExpiryDate && !payload.expiresAt) {
      throw new BadRequestException('MHD ist fuer diese Zutat erforderlich');
    }

    const purchaseOrder = payload.purchaseOrderId
      ? await this.applyPurchaseOrderReceipt(payload, actor, item)
      : undefined;
    const receivedAt = payload.receivedAt
      ? new Date(payload.receivedAt)
      : new Date();
    const unitPriceNet =
      payload.unitPriceNet ?? resolveValuationUnitCost(item) ?? 0;
    const quantityBefore = item.quantity;
    const averageCost = calculateWeightedAveragePurchasePrice({
      quantityBefore,
      previousAverageCost: resolveValuationUnitCost(item),
      receivedQuantity: payload.quantity,
      receivedUnitCost: unitPriceNet,
    });
    item.quantity = quantityBefore + payload.quantity;
    item.purchasePriceNet = unitPriceNet || item.purchasePriceNet;
    item.lastPurchasePrice = unitPriceNet || item.lastPurchasePrice;
    item.averageCost = averageCost;
    item.unitCost = averageCost;
    item.currency = item.currency ?? 'EUR';
    item.supplierId = payload.supplierId ?? item.supplierId;
    item.supplierName = payload.supplierName ?? item.supplierName;
    item.storageLocation = payload.storageLocation ?? item.storageLocation;
    this.applySupplierPriceLastPurchase(
      item,
      purchaseOrder?.supplierId ?? payload.supplierId ?? item.supplierId,
      unitPriceNet,
      receivedAt,
    );
    const saved = await item.save();

    const batch = await this.batchModel.create({
      tenantId: actor.tenantId ?? item.tenantId,
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
      tenantId: actor.tenantId ?? saved.tenantId,
      locationId: saved.locationId,
      stockItemId: saved._id.toString(),
      batchId: batch._id.toString(),
      referenceType: payload.purchaseOrderId ? 'purchase_order' : undefined,
      referenceId: payload.purchaseOrderId,
      stockItemName: saved.name,
      type: StockMovementType.Receipt,
      quantityChange: payload.quantity,
      quantityBefore,
      quantityAfter: saved.quantity,
      note: payload.note,
      reason: payload.purchaseOrderId
        ? `Wareneingang zu Bestellung ${purchaseOrder?.orderNumber ?? payload.purchaseOrderId}`
        : undefined,
      supplierId: payload.supplierId ?? saved.supplierId,
      supplierName: payload.supplierName ?? saved.supplierName,
      unitPriceNet,
      valueNet: roundMoney(payload.quantity * unitPriceNet),
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

  async reorderSuggestions(
    actor: AuthenticatedUser,
    locationId?: string,
    options: {
      supplierId?: string;
      includeCovered?: boolean;
      strategy?: ReorderSuggestionStrategy;
    } = {},
  ): Promise<ReorderSuggestionsResponse> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);
    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );

    if (options.supplierId) {
      const supplierLocation = locationId ?? locationIds[0];
      if (supplierLocation) {
        await this.assertSupplierForLocation(options.supplierId, supplierLocation);
      }
    }

    const [items, openPurchaseQuantities, activeSuppliers] = await Promise.all([
      this.stockItemModel
        .find({
          locationId: { $in: locationIds },
          isActive: { $ne: false },
          isArchived: { $ne: true },
          ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
        })
        .sort({ category: 1, name: 1 })
        .exec(),
      this.getOpenPurchaseQuantities(actor, locationIds),
      this.getActiveSuppliersByLocation(locationIds),
    ]);

    const strategy = options.strategy ?? 'preferred';
    const suggestionItems: ReorderSuggestionItemResponse[] = [];
    let coveredItems = 0;

    for (const item of items) {
      const warnings: string[] = [];
      const minimumStock = Number(item.minQuantity ?? 0);
      const currentStock = Number(item.quantity ?? 0);
      const targetStock = item.targetQuantity;

      if (minimumStock <= 0) {
        warnings.push('Missing minimum stock');
      }
      if (targetStock === undefined || targetStock === null) {
        warnings.push('Missing target stock');
      }

      if (minimumStock <= 0 || currentStock > minimumStock) {
        continue;
      }

      const target = targetStock && targetStock > 0 ? targetStock : minimumStock;
      const shortageQuantity = Math.max(0, target - currentStock);
      const openPurchaseQuantity = openPurchaseQuantities.get(item._id.toString()) ?? 0;
      const suggestedQuantity = Math.max(0, shortageQuantity - openPurchaseQuantity);
      if (shortageQuantity > 0 && suggestedQuantity === 0) {
        coveredItems += 1;
        warnings.push('Open purchase order already covers shortage');
      }
      if (suggestedQuantity <= 0 && !options.includeCovered) {
        continue;
      }

      const supplierSelection = this.selectReorderSupplier(
        item,
        activeSuppliers,
        strategy,
        options.supplierId,
      );
      warnings.push(...supplierSelection.warnings);

      const unitPriceNet =
        supplierSelection.unitPriceNet ??
        item.lastPurchasePrice ??
        resolveValuationUnitCost(item) ??
        0;
      if (!supplierSelection.unitPriceNet) {
        warnings.push('Missing supplier price');
      }
      if (!unitPriceNet) {
        warnings.push('Missing purchase price');
      }

      const estimatedTotalNet = roundMoney(suggestedQuantity * unitPriceNet);
      suggestionItems.push({
        stockItemId: item._id.toString(),
        stockItemName: item.name,
        currentStock,
        minimumStock,
        targetStock,
        unit: item.unit,
        openPurchaseQuantity,
        suggestedQuantity,
        supplierId: supplierSelection.supplierId,
        supplierName: supplierSelection.supplierName,
        unitPriceNet: unitPriceNet || undefined,
        currency: supplierSelection.currency ?? item.currency ?? 'EUR',
        estimatedTotalNet: unitPriceNet ? estimatedTotalNet : undefined,
        warnings: Array.from(new Set(warnings)),
      });
    }

    const visibleItems = options.supplierId
      ? suggestionItems.filter((item) => item.supplierId === options.supplierId)
      : suggestionItems;

    return {
      summary: {
        totalItems: items.length,
        suggestedItems: visibleItems.filter((item) => item.suggestedQuantity > 0).length,
        coveredItems,
        warningCount: visibleItems.reduce(
          (sum, item) => sum + item.warnings.length,
          0,
        ),
        estimatedTotalNet: roundMoney(
          visibleItems.reduce(
            (sum, item) => sum + (item.estimatedTotalNet ?? 0),
            0,
          ),
        ),
      },
      items: visibleItems,
    };
  }

  async createPurchaseOrdersFromReorderSuggestions(
    payload: CreateReorderPurchaseOrderDto,
    actor: AuthenticatedUser,
  ): Promise<PurchaseOrderResponse[]> {
    await this.assertCanUseLocation(actor, payload.locationId);
    if (!payload.items.length) {
      throw new BadRequestException(
        'Bestellvorschlag benoetigt mindestens eine Position',
      );
    }

    const grouped = new Map<
      string,
      Array<{ stockItemId: string; quantity: number; expectedUnitCost?: number }>
    >();
    const activeSuppliers = await this.getActiveSuppliersByLocation([
      payload.locationId,
    ]);

    for (const item of payload.items) {
      const stockItem = await this.findStockItemForActor(item.stockItemId, actor);
      if (stockItem.locationId !== payload.locationId) {
        throw new BadRequestException(
          'Bestellvorschlag enthaelt Artikel aus anderem Standort',
        );
      }
      const supplierId =
        item.supplierId ??
        payload.supplierId ??
        this.selectReorderSupplier(stockItem, activeSuppliers, 'preferred')
          .supplierId;
      if (!supplierId) {
        throw new BadRequestException(
          `Kein Lieferant fuer ${stockItem.name} ausgewaehlt`,
        );
      }
      await this.assertSupplierForLocation(supplierId, payload.locationId);
      const lines = grouped.get(supplierId) ?? [];
      lines.push({
        stockItemId: item.stockItemId,
        quantity: item.quantity,
        expectedUnitCost: item.expectedUnitCost,
      });
      grouped.set(supplierId, lines);
    }

    const orders: PurchaseOrderResponse[] = [];
    for (const [supplierId, lines] of grouped.entries()) {
      orders.push(
        await this.createPurchaseOrder(
          {
            locationId: payload.locationId,
            supplierId,
            lines,
            note: 'Aus Bestellvorschlaegen erstellt',
          },
          actor,
        ),
      );
    }
    return orders;
  }

  async listPurchaseOrders(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<PurchaseOrderResponse[]> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);
    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );

    const orders = await this.purchaseOrderModel
      .find({
        locationId: { $in: locationIds },
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
      })
      .sort({ createdAt: -1 })
      .exec();

    return orders.map((order) => this.toPurchaseOrderResponse(order));
  }

  async createPurchaseOrder(
    payload: CreatePurchaseOrderDto,
    actor: AuthenticatedUser,
  ): Promise<PurchaseOrderResponse> {
    await this.assertCanUseLocation(actor, payload.locationId);
    const supplier = await this.assertSupplierForLocation(
      payload.supplierId,
      payload.locationId,
    );

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
      this.assertTenantMatch(actor, item.tenantId, 'Nachbestellartikel');
      const unitPriceNet = this.resolvePurchaseOrderUnitCost(
        item,
        payload.supplierId,
        line.expectedUnitCost,
      );
      lines.push({
        stockItemId: item._id.toString(),
        stockItemName: item.name,
        quantity: line.quantity,
        unit: item.unit,
        unitPriceNet,
        expectedUnitCost: unitPriceNet,
        totalNet: roundMoney(line.quantity * unitPriceNet),
        receivedQuantity: 0,
      });
    }

    const totalNet = lines.reduce((sum, line) => sum + line.totalNet, 0);
    const order = await this.purchaseOrderModel.create({
      tenantId: actor.tenantId,
      companyId: actor.companyId,
      locationId: payload.locationId,
      supplierId: payload.supplierId,
      supplierName: payload.supplierName ?? supplier.name,
      orderNumber: await this.nextPurchaseOrderNumber(payload.locationId),
      status: PurchaseOrderStatus.Draft,
      lines,
      totalNet,
      expectedDeliveryDate: this.parseOptionalDate(
        payload.expectedDeliveryDate,
        'Lieferdatum',
      ),
      note: payload.note,
      createdBy: actor.sub,
    });

    return this.toPurchaseOrderResponse(order);
  }

  async updatePurchaseOrderStatus(
    id: string,
    payload: UpdatePurchaseOrderStatusDto,
    actor: AuthenticatedUser,
  ): Promise<PurchaseOrderResponse> {
    const order = await this.purchaseOrderModel.findById(id).exec();
    if (!order) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }
    await this.assertCanUseLocation(actor, order.locationId);
    this.assertTenantMatch(actor, order.tenantId, 'Bestellung');

    const nextStatus = payload.status;
    if (nextStatus === PurchaseOrderStatus.PartiallyReceived) {
      throw new BadRequestException(
        'Teilweise geliefert wird automatisch durch Wareneingang gesetzt',
      );
    }
    if (nextStatus === PurchaseOrderStatus.Received) {
      throw new BadRequestException(
        'Geliefert wird automatisch durch Wareneingang gesetzt',
      );
    }
    if (nextStatus === PurchaseOrderStatus.Draft) {
      throw new BadRequestException(
        'Bestellungen koennen nicht in Entwurf zurueckgesetzt werden',
      );
    }
    if (
      order.status === PurchaseOrderStatus.Received &&
      nextStatus === PurchaseOrderStatus.Cancelled
    ) {
      throw new BadRequestException(
        'Gelieferte Bestellungen koennen nicht storniert werden',
      );
    }
    if (
      nextStatus === PurchaseOrderStatus.Ordered &&
      order.status !== PurchaseOrderStatus.Draft
    ) {
      throw new BadRequestException(
        'Nur Entwuerfe koennen als bestellt markiert werden',
      );
    }

    order.status = nextStatus;
    return this.toPurchaseOrderResponse(await order.save());
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
      totalStockValueNet: roundMoney(
        items.reduce((sum, item) => sum + calculateStockValueNet(item), 0),
      ),
      missingPriceCount: items.filter(
        (item) => createValuationWarnings(item).length > 0,
      ).length,
      valuationWarnings: items
        .filter((item) => createValuationWarnings(item).length > 0)
        .map((item) => `${item.name}: Einkaufspreis fehlt`),
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

  async procurementDashboard(
    actor: AuthenticatedUser,
    options: {
      locationId?: string;
      supplierId?: string;
      status?: PurchaseOrderStatus;
      range?: 'today' | 'week' | 'month' | 'custom';
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ): Promise<ProcurementDashboardResponse> {
    const locationIds = options.locationId
      ? [options.locationId]
      : await this.getReadableLocationIds(actor);
    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );

    const range = this.resolveProcurementDateRange(
      options.range,
      options.dateFrom,
      options.dateTo,
    );
    const orderQuery = {
      locationId: { $in: locationIds },
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
      ...(options.supplierId ? { supplierId: options.supplierId } : {}),
      ...(options.status ? { status: options.status } : {}),
    };
    const receiptQuery = {
      locationId: { $in: locationIds },
      ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
      type: StockMovementType.Receipt,
      createdAt: { $gte: range.from, $lte: range.to },
      ...(options.supplierId ? { supplierId: options.supplierId } : {}),
    };

    const [orders, receipts, items, reorderSuggestions, locations] =
      await Promise.all([
        this.purchaseOrderModel.find(orderQuery).sort({ createdAt: -1 }).exec(),
        this.movementModel.find(receiptQuery).sort({ createdAt: -1 }).limit(80).exec(),
        this.stockItemModel
          .find({
            locationId: { $in: locationIds },
            ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
            isActive: { $ne: false },
            isArchived: { $ne: true },
          })
          .sort({ name: 1 })
          .exec(),
        this.reorderSuggestions(actor, options.locationId, {
          supplierId: options.supplierId,
          includeCovered: true,
          strategy: 'preferred',
        }),
        this.locationModel
          .find({ _id: { $in: locationIds } })
          .select('_id name')
          .lean()
          .exec(),
      ]);

    const locationNames = new Map(
      locations.map((location) => [location._id.toString(), location.name]),
    );
    const ordersById = new Map(
      orders.map((order) => [order._id.toString(), order]),
    );
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const openStatuses = [
      PurchaseOrderStatus.Ordered,
      PurchaseOrderStatus.PartiallyReceived,
    ];
    const unresolvedStatuses = [
      PurchaseOrderStatus.Draft,
      PurchaseOrderStatus.Ordered,
      PurchaseOrderStatus.PartiallyReceived,
    ];
    const openOrders = orders.filter((order) =>
      openStatuses.includes(order.status),
    );
    const overdueOrders = orders.filter(
      (order) =>
        Boolean(order.expectedDeliveryDate) &&
        order.expectedDeliveryDate! < today &&
        ![PurchaseOrderStatus.Received, PurchaseOrderStatus.Cancelled].includes(
          order.status,
        ),
    );
    const criticalItems = items.filter(
      (item) => item.quantity <= item.minQuantity,
    );
    const warnings: ProcurementDashboardResponse['warnings'] = [];

    for (const order of overdueOrders) {
      warnings.push({
        type: 'overdue_order',
        severity: 'critical',
        purchaseOrderId: order._id.toString(),
        supplierId: order.supplierId,
        locationId: order.locationId,
        message: `Bestellung ${order.orderNumber} ist ueberfaellig.`,
      });
    }

    for (const item of criticalItems.slice(0, 20)) {
      warnings.push({
        type: 'critical_stock',
        severity: 'warning',
        stockItemId: item._id.toString(),
        supplierId: item.supplierId,
        locationId: item.locationId,
        message: `${item.name} liegt am oder unter Mindestbestand.`,
      });
    }

    for (const suggestion of reorderSuggestions.items) {
      for (const warning of suggestion.warnings) {
        warnings.push({
          type: this.mapReorderWarningType(warning),
          severity: warning === 'Missing supplier' ? 'critical' : 'warning',
          stockItemId: suggestion.stockItemId,
          supplierId: suggestion.supplierId,
          message: `${suggestion.stockItemName}: ${warning}`,
        });
      }
    }

    const supplierRanking = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        orderCount: number;
        purchaseValueNet: number;
        openOrders: number;
        lastPurchaseAt?: string;
      }
    >();
    for (const order of orders) {
      const entry = supplierRanking.get(order.supplierId) ?? {
        supplierId: order.supplierId,
        supplierName: order.supplierName,
        orderCount: 0,
        purchaseValueNet: 0,
        openOrders: 0,
      };
      entry.orderCount += 1;
      entry.purchaseValueNet = roundMoney(entry.purchaseValueNet + order.totalNet);
      if (unresolvedStatuses.includes(order.status)) {
        entry.openOrders += 1;
      }
      const createdAt = (order as PurchaseOrderDocument & { createdAt?: Date }).createdAt;
      if (
        createdAt &&
        (!entry.lastPurchaseAt || createdAt > new Date(entry.lastPurchaseAt))
      ) {
        entry.lastPurchaseAt = createdAt.toISOString();
      }
      supplierRanking.set(order.supplierId, entry);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const receiptResponses = receipts.map((movement) => {
      const response = this.toMovementResponse(movement);
      const order = response.referenceId
        ? ordersById.get(response.referenceId)
        : undefined;
      return {
        ...response,
        purchaseOrderNumber: order?.orderNumber,
        locationName: locationNames.get(response.locationId),
      };
    });
    const purchaseOrders = orders.map((order) => {
      const response = this.toPurchaseOrderResponse(order);
      const openQuantity = response.lines.reduce(
        (sum, line) => sum + line.openQuantity,
        0,
      );
      return {
        ...response,
        openQuantity: this.roundQuantity(openQuantity),
        locationName: locationNames.get(response.locationId),
        isOverdue: overdueOrders.some(
          (entry) => entry._id.toString() === response._id,
        ),
      };
    });

    return {
      summary: {
        openOrders: openOrders.length,
        partiallyReceivedOrders: orders.filter(
          (order) => order.status === PurchaseOrderStatus.PartiallyReceived,
        ).length,
        overdueOrders: overdueOrders.length,
        openOrderValueNet: roundMoney(
          openOrders.reduce((sum, order) => sum + order.totalNet, 0),
        ),
        receiptsToday: receipts.filter((movement) => {
          const createdAt = (movement as StockMovementDocument & { createdAt?: Date }).createdAt;
          return createdAt ? createdAt >= todayStart : false;
        }).length,
        criticalStockItems: criticalItems.length,
        reorderSuggestions: reorderSuggestions.summary.suggestedItems,
        purchaseVolumeNet: roundMoney(
          orders.reduce((sum, order) => sum + order.totalNet, 0),
        ),
        receiptValueNet: roundMoney(
          receipts.reduce((sum, movement) => sum + Number(movement.valueNet ?? 0), 0),
        ),
      },
      purchaseOrders,
      receipts: receiptResponses,
      supplierRanking: [...supplierRanking.values()].sort(
        (left, right) => right.purchaseValueNet - left.purchaseValueNet,
      ),
      reorderSuggestions: reorderSuggestions.items.filter(
        (item) => item.suggestedQuantity > 0,
      ),
      warnings,
      filters: {
        locationIds,
        range: range.range,
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
      },
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
      const unitPriceNet = resolveValuationUnitCost(item);
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
        valueNet: roundMoney(Math.abs(difference) * unitPriceNet),
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
    const unitPriceNet =
      payload.unitPriceNet ?? resolveValuationUnitCost(saved);
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
      valueNet: roundMoney(Math.abs(payload.quantityChange) * unitPriceNet),
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

  private async applyPurchaseOrderReceipt(
    payload: ReceiveStockDto,
    actor: AuthenticatedUser,
    item: StockItemDocument,
  ): Promise<PurchaseOrderDocument> {
    const order = await this.purchaseOrderModel
      .findById(payload.purchaseOrderId)
      .exec();
    if (!order) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    await this.assertCanUseLocation(actor, order.locationId);
    this.assertTenantMatch(actor, order.tenantId, 'Bestellung');

    if (order.locationId !== item.locationId) {
      throw new BadRequestException(
        'Bestellung und Lagerartikel gehoeren nicht zum selben Standort',
      );
    }
    if (order.status === PurchaseOrderStatus.Cancelled) {
      throw new BadRequestException(
        'Stornierte Bestellungen koennen keinen Wareneingang erhalten',
      );
    }
    if (order.status === PurchaseOrderStatus.Received) {
      throw new BadRequestException('Bestellung ist bereits vollstaendig geliefert');
    }
    if (order.status === PurchaseOrderStatus.Draft) {
      throw new BadRequestException(
        'Bestellung muss vor Wareneingang als bestellt markiert werden',
      );
    }

    const line = this.findPurchaseOrderLine(order, payload, item);
    if (line.stockItemId !== item._id.toString()) {
      throw new BadRequestException(
        'Wareneingang passt nicht zur ausgewaehlten Bestellposition',
      );
    }

    const receivedQuantity = Number(line.receivedQuantity ?? 0);
    const openQuantity = Math.max(0, Number(line.quantity ?? 0) - receivedQuantity);
    if (payload.quantity > openQuantity) {
      throw new BadRequestException(
        `Wareneingang ueberschreitet offene Bestellmenge von ${openQuantity} ${line.unit}`,
      );
    }

    line.receivedQuantity = this.roundQuantity(receivedQuantity + payload.quantity);
    order.status = this.resolvePurchaseOrderStatus(order.lines);
    await order.save();
    return order;
  }

  private findPurchaseOrderLine(
    order: PurchaseOrderDocument,
    payload: ReceiveStockDto,
    item: StockItemDocument,
  ): PurchaseOrderLine {
    const lines = order.lines ?? [];
    if (payload.purchaseOrderLineId) {
      const line = lines.find(
        (entry) => entry._id?.toString() === payload.purchaseOrderLineId,
      );
      if (!line) {
        throw new NotFoundException('Bestellposition nicht gefunden');
      }
      return line;
    }

    const matchingLines = lines.filter(
      (entry) => entry.stockItemId === item._id.toString(),
    );
    if (matchingLines.length !== 1) {
      throw new BadRequestException(
        'Bestellposition ist fuer diesen Artikel nicht eindeutig',
      );
    }

    return matchingLines[0];
  }

  private resolvePurchaseOrderStatus(
    lines: PurchaseOrderLine[],
  ): PurchaseOrderStatus {
    const hasReceived = lines.some(
      (line) => Number(line.receivedQuantity ?? 0) > 0,
    );
    const allReceived =
      lines.length > 0 &&
      lines.every(
        (line) => Number(line.receivedQuantity ?? 0) >= Number(line.quantity),
      );

    if (allReceived) {
      return PurchaseOrderStatus.Received;
    }
    if (hasReceived) {
      return PurchaseOrderStatus.PartiallyReceived;
    }

    return PurchaseOrderStatus.Ordered;
  }

  private async assertSupplierForLocation(
    supplierId: string,
    locationId: string,
  ): Promise<SupplierDocument> {
    const supplier = await this.supplierModel.findById(supplierId).exec();
    if (!supplier) {
      throw new NotFoundException('Lieferant nicht gefunden');
    }
    if (supplier.locationId !== locationId) {
      throw new BadRequestException(
        'Lieferant gehoert nicht zum Standort der Bestellung',
      );
    }
    if (supplier.isArchived || supplier.isActive === false) {
      throw new BadRequestException('Lieferant ist nicht aktiv');
    }
    return supplier;
  }

  private async findStockItemForActor(
    stockItemId: string,
    actor: AuthenticatedUser,
  ): Promise<StockItemDocument> {
    const item = await this.stockItemModel.findById(stockItemId).exec();
    if (!item) {
      throw new NotFoundException('Lagerartikel nicht gefunden');
    }
    await this.assertCanUseLocation(actor, item.locationId);
    this.assertTenantMatch(actor, item.tenantId, 'Lagerartikel');
    return item;
  }

  private assertTenantMatch(
    actor: AuthenticatedUser,
    tenantId: string | undefined,
    entityName: string,
  ): void {
    if (actor.tenantId && tenantId && tenantId !== actor.tenantId) {
      throw new BadRequestException(
        `${entityName} gehoert nicht zum Tenant des Benutzers`,
      );
    }
  }

  private roundQuantity(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private async getOpenPurchaseQuantities(
    actor: AuthenticatedUser,
    locationIds: string[],
  ): Promise<Map<string, number>> {
    const orders = await this.purchaseOrderModel
      .find({
        locationId: { $in: locationIds },
        ...(actor.tenantId ? { tenantId: actor.tenantId } : {}),
        status: {
          $in: [
            PurchaseOrderStatus.Draft,
            PurchaseOrderStatus.Ordered,
            PurchaseOrderStatus.PartiallyReceived,
          ],
        },
      })
      .exec();
    const quantities = new Map<string, number>();
    for (const order of orders) {
      for (const line of order.lines ?? []) {
        const openQuantity = Math.max(
          0,
          Number(line.quantity ?? 0) - Number(line.receivedQuantity ?? 0),
        );
        quantities.set(
          line.stockItemId,
          this.roundQuantity(
            (quantities.get(line.stockItemId) ?? 0) + openQuantity,
          ),
        );
      }
    }
    return quantities;
  }

  private async getActiveSuppliersByLocation(
    locationIds: string[],
  ): Promise<Map<string, SupplierDocument>> {
    const suppliers = await this.supplierModel
      .find({
        locationId: { $in: locationIds },
        isActive: { $ne: false },
        isArchived: { $ne: true },
      })
      .exec();
    return new Map(
      suppliers.map((supplier) => [supplier._id.toString(), supplier]),
    );
  }

  private selectReorderSupplier(
    item: StockItemDocument,
    activeSuppliers: Map<string, SupplierDocument>,
    strategy: ReorderSuggestionStrategy,
    requiredSupplierId?: string,
  ): {
    supplierId?: string;
    supplierName?: string;
    unitPriceNet?: number;
    currency?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const activePrices = (item.supplierPrices ?? []).filter((price) =>
      activeSuppliers.has(price.supplierId),
    );
    const requiredPrice = requiredSupplierId
      ? activePrices.find((price) => price.supplierId === requiredSupplierId)
      : undefined;
    const preferredPrice = getPreferredSupplierPrice(activePrices);
    const cheapestPrice = getCheapestSupplierPrice(activePrices);
    const selectedPrice =
      requiredPrice ??
      (strategy === 'cheapest' ? cheapestPrice : preferredPrice ?? cheapestPrice);

    if (requiredSupplierId && !requiredPrice) {
      warnings.push('Missing supplier price');
    }
    if (selectedPrice) {
      return {
        supplierId: selectedPrice.supplierId,
        supplierName:
          selectedPrice.supplierName ??
          activeSuppliers.get(selectedPrice.supplierId)?.name,
        unitPriceNet: selectedPrice.unitPriceNet,
        currency: selectedPrice.currency ?? item.currency ?? 'EUR',
        warnings,
      };
    }

    if (item.supplierId && activeSuppliers.has(item.supplierId)) {
      warnings.push('Missing supplier price');
      return {
        supplierId: item.supplierId,
        supplierName:
          item.supplierName ?? activeSuppliers.get(item.supplierId)?.name,
        warnings,
      };
    }

    warnings.push('Missing supplier');
    return { warnings };
  }

  private resolvePurchaseOrderUnitCost(
    item: StockItemDocument,
    supplierId: string,
    explicitUnitCost?: number,
  ): number {
    if (explicitUnitCost !== undefined) {
      return roundMoney(explicitUnitCost);
    }
    const supplierPrice = (item.supplierPrices ?? []).find(
      (price) => price.supplierId === supplierId,
    );
    if (supplierPrice) {
      return roundMoney(supplierPrice.unitPriceNet ?? 0);
    }
    return roundMoney(
      item.lastPurchasePrice ??
        item.averageCost ??
        item.unitCost ??
        item.purchasePriceNet ??
        0,
    );
  }

  private applySupplierPriceLastPurchase(
    item: StockItemDocument,
    supplierId: string | undefined,
    unitPriceNet: number,
    purchasedAt: Date,
  ): void {
    if (!supplierId) {
      return;
    }
    const supplierPrice = (item.supplierPrices ?? []).find(
      (price) => price.supplierId === supplierId,
    );
    if (!supplierPrice) {
      return;
    }
    supplierPrice.lastPurchasedAt = purchasedAt;
    supplierPrice.lastPurchasePriceNet = roundMoney(unitPriceNet);
    supplierPrice.updatedAt = new Date();
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

  private resolveProcurementDateRange(
    value?: 'today' | 'week' | 'month' | 'custom',
    dateFrom?: string,
    dateTo?: string,
  ): {
    range: 'today' | 'week' | 'month' | 'custom';
    from: Date;
    to: Date;
  } {
    const range = value ?? 'month';
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);

    if (range === 'custom') {
      return {
        range,
        from: this.parseOptionalDate(dateFrom, 'Startdatum') ?? from,
        to: this.endOfDay(this.parseOptionalDate(dateTo, 'Enddatum') ?? to),
      };
    }

    if (range === 'week') {
      from.setDate(from.getDate() - 6);
    } else if (range === 'month') {
      from.setDate(from.getDate() - 29);
    }

    return { range, from, to };
  }

  private mapReorderWarningType(
    warning: string,
  ): ProcurementDashboardResponse['warnings'][number]['type'] {
    if (warning === 'Missing supplier') {
      return 'missing_supplier';
    }
    if (warning === 'Missing supplier price') {
      return 'missing_supplier_price';
    }
    if (warning === 'Missing purchase price') {
      return 'missing_purchase_price';
    }
    return 'critical_stock';
  }

  private parseOptionalDate(value?: string, label = 'Datum'): Date | undefined {
    if (!value?.trim()) {
      return undefined;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Ungueltiges ${label}`);
    }
    return date;
  }

  private endOfDay(value: Date): Date {
    const date = new Date(value);
    date.setHours(23, 59, 59, 999);
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

  private toSupplierPriceResponses(
    prices: StockSupplierPrice[],
  ): SupplierPriceResponse[] {
    return prices.map((price) => ({
      supplierId: price.supplierId,
      supplierName: price.supplierName,
      unitPriceNet: roundMoney(price.unitPriceNet ?? 0),
      currency: price.currency ?? 'EUR',
      unit: price.unit,
      minimumOrderQuantity: price.minimumOrderQuantity,
      leadTimeDays: price.leadTimeDays,
      isPreferred: price.isPreferred ?? false,
      lastPurchasedAt: price.lastPurchasedAt?.toISOString(),
      lastPurchasePriceNet: price.lastPurchasePriceNet,
      notes: price.notes,
      updatedAt: price.updatedAt?.toISOString(),
    }));
  }

  private toItemResponse(item: StockItemDocument): StockItemResponse {
    const timestamped = item as StockItemDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    const averagePurchasePrice = resolveValuationUnitCost(item);
    const supplierPrices = this.toSupplierPriceResponses(
      item.supplierPrices ?? [],
    );
    const preferredSupplierPrice = getPreferredSupplierPrice(supplierPrices);
    const cheapestSupplierPrice = getCheapestSupplierPrice(supplierPrices);
    const supplierPriceDifferenceNet =
      calculateSupplierPriceDifference(supplierPrices);

    return {
      _id: item._id.toString(),
      tenantId: item.tenantId,
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
      lastPurchasePrice: item.lastPurchasePrice ?? item.purchasePriceNet ?? 0,
      averageCost: item.averageCost ?? averagePurchasePrice,
      averagePurchasePrice,
      unitCost: item.unitCost ?? averagePurchasePrice,
      currency: item.currency ?? 'EUR',
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
      stockValueNet: calculateStockValueNet(item),
      valuationWarnings: createValuationWarnings(item),
      supplierPrices,
      preferredSupplierPrice,
      cheapestSupplierPrice,
      supplierPriceDifferenceNet,
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
      extraId: movement.extraId,
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
      unitCost: batch.unitPriceNet ?? 0,
      totalValueNet: roundMoney(
        (batch.initialQuantity ?? 0) * (batch.unitPriceNet ?? 0),
      ),
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

  private toPurchaseOrderResponse(
    order: PurchaseOrderDocument,
  ): PurchaseOrderResponse {
    const timestamped = order as PurchaseOrderDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };
    const lines = (order.lines ?? []).map((line) => {
      const expectedUnitCost =
        line.expectedUnitCost ?? line.unitPriceNet ?? 0;
      const receivedQuantity = Number(line.receivedQuantity ?? 0);
      const quantity = Number(line.quantity ?? 0);
      return {
        _id: line._id?.toString() ?? '',
        stockItemId: line.stockItemId,
        stockItemName: line.stockItemName,
        quantity,
        unit: line.unit,
        expectedUnitCost,
        unitPriceNet: line.unitPriceNet ?? expectedUnitCost,
        totalNet: line.totalNet ?? quantity * expectedUnitCost,
        receivedQuantity,
        openQuantity: Math.max(0, quantity - receivedQuantity),
      };
    });

    return {
      _id: order._id.toString(),
      tenantId: order.tenantId,
      companyId: order.companyId,
      locationId: order.locationId,
      supplierId: order.supplierId,
      supplierName: order.supplierName,
      orderNumber: order.orderNumber,
      status: order.status,
      lines,
      totalNet: order.totalNet,
      expectedDeliveryDate: order.expectedDeliveryDate?.toISOString(),
      note: order.note,
      createdBy: order.createdBy,
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }

  private async nextPurchaseOrderNumber(locationId: string): Promise<string> {
    const count = await this.purchaseOrderModel
      .countDocuments({ locationId })
      .exec();
    return `PO-${String(count + 1).padStart(5, '0')}`;
  }
}
