import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Order,
  OrderItem,
} from '../orders/schemas/order.schema';
import { InventoryBatch } from '../stock/schemas/inventory-batch.schema';
import { StockAlert } from '../stock/schemas/stock-alert.schema';
import {
  StockItem,
  StockItemDocument,
} from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementType,
} from '../stock/schemas/stock-movement.schema';
import { resolveValuationUnitCost, roundMoney } from '../stock/stock-valuation';
import {
  Recipe,
  RecipeDocument,
} from './schemas/recipe.schema';

type InventoryOrder = Order & {
  _id?: unknown;
  inventoryConsumedAt?: Date;
  inventoryDeducted?: boolean;
  inventoryReversedAt?: Date;
};

export interface InventoryConsumptionResult {
  movementIds: string[];
  warnings: string[];
}

interface ConsumptionPlanLine {
  recipe?: RecipeDocument;
  ingredient: {
    stockItemId: string;
    stockItemName: string;
    quantity: number;
    unit: string;
    wasteFactor?: number;
    purchasePriceNet?: number;
    isOptional?: boolean;
  };
  stockItem: StockItemDocument;
  orderItemId?: string;
  orderItemName: string;
  menuItemId?: string;
  extraId?: string;
  extraName?: string;
  requiredQuantity: number;
}

@Injectable()
export class RecipeInventoryService {
  constructor(
    @InjectModel(Recipe.name)
    private readonly recipeModel: Model<RecipeDocument>,
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(InventoryBatch.name)
    private readonly batchModel: Model<InventoryBatch>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovement>,
    @InjectModel(StockAlert.name)
    private readonly stockAlertModel: Model<StockAlert>,
  ) {}

  async consumeOrder(
    order: InventoryOrder,
    actorId: string,
  ): Promise<InventoryConsumptionResult> {
    if (order.inventoryDeducted || order.inventoryConsumedAt) {
      return { movementIds: [], warnings: [] };
    }
    if (
      await this.hasExistingOrderMovement(
        order,
        StockMovementType.OrderConsumption,
      )
    ) {
      return {
        movementIds: [],
        warnings: ['Bestellung wurde bereits vom Lager abgezogen.'],
      };
    }

    const plan = await this.buildConsumptionPlan(order);
    const movementIds = await this.applyPlan(
      plan.lines,
      order,
      actorId,
      StockMovementType.OrderConsumption,
      (line) => -line.requiredQuantity,
      'Automatischer Zutatenverbrauch',
    );

    return { movementIds, warnings: plan.warnings };
  }

  async reverseOrder(
    order: InventoryOrder,
    actorId: string,
  ): Promise<InventoryConsumptionResult> {
    if (order.inventoryReversedAt) {
      return { movementIds: [], warnings: [] };
    }
    if (
      await this.hasExistingOrderMovement(
        order,
        StockMovementType.OrderCancelReversal,
      )
    ) {
      return {
        movementIds: [],
        warnings: ['Bestellung wurde bereits ins Lager zurueckgebucht.'],
      };
    }

    const plan = await this.buildConsumptionPlan(order);
    const movementIds = await this.applyPlan(
      plan.lines,
      order,
      actorId,
      StockMovementType.OrderCancelReversal,
      (line) => line.requiredQuantity,
      'Rueckbuchung nach Storno',
    );

    return { movementIds, warnings: plan.warnings };
  }

  async adjustOrder(
    previousOrder: InventoryOrder,
    nextOrder: InventoryOrder,
    actorId: string,
  ): Promise<InventoryConsumptionResult> {
    if (
      !previousOrder.inventoryDeducted &&
      !previousOrder.inventoryConsumedAt
    ) {
      return { movementIds: [], warnings: [] };
    }

    const [previousPlan, nextPlan] = await Promise.all([
      this.buildConsumptionPlan(previousOrder),
      this.buildConsumptionPlan(nextOrder),
    ]);
    const previousByKey = this.aggregatePlan(previousPlan.lines);
    const nextByKey = this.aggregatePlan(nextPlan.lines);
    const movementIds: string[] = [];
    const keys = new Set([...previousByKey.keys(), ...nextByKey.keys()]);

    for (const key of keys) {
      const previous = previousByKey.get(key);
      const next = nextByKey.get(key);
      const reference = next ?? previous;

      if (!reference) {
        continue;
      }

      const difference =
        (next?.requiredQuantity ?? 0) - (previous?.requiredQuantity ?? 0);

      if (difference === 0) {
        continue;
      }

      const ids = await this.applyPlan(
        [{ ...reference, requiredQuantity: Math.abs(difference) }],
        nextOrder,
        actorId,
        StockMovementType.OrderQuantityAdjustment,
        () => (difference > 0 ? -Math.abs(difference) : Math.abs(difference)),
        'Mengenanpassung nach Bestandsabbuchung',
      );
      movementIds.push(...ids);
    }

    return {
      movementIds,
      warnings: [...previousPlan.warnings, ...nextPlan.warnings],
    };
  }

  async checkAvailability(
    recipe: RecipeDocument,
    locationId: string,
    portions = 1,
  ) {
    const missing = [];

    for (const ingredient of recipe.ingredients) {
      const item = await this.stockItemModel
        .findById(ingredient.stockItemId)
        .exec();
      const required = this.requiredQuantity(ingredient, portions);

      if (!item || item.locationId !== locationId || item.quantity < required) {
        missing.push({
          stockItemId: ingredient.stockItemId,
          stockItemName: ingredient.stockItemName,
          required,
          available: item?.quantity ?? 0,
          unit: ingredient.unit,
        });
      }
    }

    return { available: missing.length === 0, missing };
  }

  private async buildConsumptionPlan(order: InventoryOrder): Promise<{
    lines: ConsumptionPlanLine[];
    warnings: string[];
  }> {
    const lines: ConsumptionPlanLine[] = [];
    const warnings: string[] = [];

    for (const orderItem of order.items ?? []) {
      const recipe = await this.findRecipe(orderItem);

      if (recipe) {
        await this.appendRecipeLines(lines, warnings, order, orderItem, recipe);
      } else {
        warnings.push(`Kein Rezept fuer ${orderItem.name} gefunden.`);
      }

      await this.appendExtraLines(lines, warnings, order, orderItem, recipe);
    }

    return { lines, warnings };
  }

  private async appendRecipeLines(
    lines: ConsumptionPlanLine[],
    warnings: string[],
    order: InventoryOrder,
    orderItem: OrderItem,
    recipe: RecipeDocument,
  ): Promise<void> {
    if (recipe.locationId && recipe.locationId !== order.locationId) {
      throw new BadRequestException(
        `Rezept ${recipe.name} gehoert nicht zum Standort der Bestellung`,
      );
    }

    if (!recipe.ingredients.length) {
      warnings.push(`Rezept ${recipe.name} enthaelt keine Zutaten.`);
      return;
    }

    for (const ingredient of recipe.ingredients) {
      if (ingredient.isOptional) {
        continue;
      }

      const stockItem = await this.resolveStockItemForConsumption(
        ingredient.stockItemId,
        ingredient.stockItemName,
        ingredient.unit,
        order,
        warnings,
        'Zutat',
      );

      if (!stockItem) {
        continue;
      }

      lines.push({
        recipe,
        ingredient,
        stockItem,
        orderItemId: this.stringifyId(orderItem._id),
        orderItemName: orderItem.name,
        menuItemId: orderItem.menuItemId ?? orderItem.productId,
        requiredQuantity: this.requiredQuantity(
          ingredient,
          orderItem.quantity,
        ),
      });
    }
  }

  private async appendExtraLines(
    lines: ConsumptionPlanLine[],
    warnings: string[],
    order: InventoryOrder,
    orderItem: OrderItem,
    recipe?: RecipeDocument | null,
  ): Promise<void> {
    for (const extra of orderItem.selectedExtras ?? []) {
      for (const impact of extra.inventoryImpact ?? []) {
        if (!impact.stockItemId || Number(impact.quantity) <= 0) {
          warnings.push(
            `Lagerverbrauch fuer Extra ${extra.name} ist unvollstaendig.`,
          );
          continue;
        }

        const stockItem = await this.resolveStockItemForConsumption(
          impact.stockItemId,
          impact.stockItemName,
          impact.unit,
          order,
          warnings,
          `Extra ${extra.name}`,
        );

        if (!stockItem) {
          continue;
        }

        lines.push({
          recipe: recipe ?? undefined,
          ingredient: {
            stockItemId: impact.stockItemId,
            stockItemName: impact.stockItemName,
            quantity: Number(impact.quantity),
            unit: impact.unit,
            wasteFactor: 1,
            purchasePriceNet: 0,
          },
          stockItem,
          orderItemId: this.stringifyId(orderItem._id),
          orderItemName: orderItem.name,
          menuItemId: orderItem.menuItemId ?? orderItem.productId,
          extraId: extra.extraId,
          extraName: extra.name,
          requiredQuantity: Number(impact.quantity) * orderItem.quantity,
        });
      }
    }
  }

  private async resolveStockItemForConsumption(
    stockItemId: string,
    stockItemName: string,
    unit: string,
    order: InventoryOrder,
    warnings: string[],
    sourceLabel: string,
  ): Promise<StockItemDocument | null> {
    const stockItem = await this.stockItemModel.findById(stockItemId).exec();

    if (!stockItem) {
      warnings.push(`Lagerartikel ${stockItemName} fehlt.`);
      return null;
    }

    if (stockItem.locationId !== order.locationId) {
      throw new BadRequestException(
        `${sourceLabel} ${stockItem.name} gehoert nicht zum Standort der Bestellung`,
      );
    }
    if (
      order.tenantId &&
      stockItem.tenantId &&
      stockItem.tenantId !== order.tenantId
    ) {
      throw new BadRequestException(
        `${sourceLabel} ${stockItem.name} gehoert nicht zum Tenant der Bestellung`,
      );
    }

    if (stockItem.unit !== unit) {
      warnings.push(
        `Einheit abweichend fuer ${stockItem.name}: Verbrauch ${unit}, Lager ${stockItem.unit}.`,
      );
    }

    return stockItem;
  }

  private async findRecipe(
    orderItem: OrderItem,
  ): Promise<RecipeDocument | null> {
    const menuItemId = orderItem.menuItemId ?? orderItem.productId;

    return this.recipeModel
      .findOne({
        isActive: true,
        isArchived: { $ne: true },
        $or: [
          ...(menuItemId ? [{ menuItemId }] : []),
          { name: orderItem.name },
        ],
      })
      .exec();
  }

  private aggregatePlan(
    lines: ConsumptionPlanLine[],
  ): Map<string, ConsumptionPlanLine> {
    const aggregate = new Map<string, ConsumptionPlanLine>();

    for (const line of lines) {
      const key = `${this.stringifyId(line.recipe?._id) || 'extra'}:${line.stockItem._id.toString()}:${line.menuItemId ?? ''}:${line.orderItemId ?? ''}:${line.extraId ?? ''}`;
      const current = aggregate.get(key);

      aggregate.set(key, {
        ...line,
        requiredQuantity:
          (current?.requiredQuantity ?? 0) + line.requiredQuantity,
      });
    }

    return aggregate;
  }

  private async applyPlan(
    lines: ConsumptionPlanLine[],
    order: InventoryOrder,
    actorId: string,
    movementType: StockMovementType,
    quantityChangeFor: (line: ConsumptionPlanLine) => number,
    notePrefix: string,
  ): Promise<string[]> {
    const movementIds: string[] = [];

    for (const line of lines) {
      const item = line.stockItem;
      const quantityChange = quantityChangeFor(line);
      const quantity = Math.abs(quantityChange);
      const before = item.quantity;
      item.quantity = before + quantityChange;
      await item.save();

      const batchIds =
        quantityChange < 0
          ? await this.consumeBatches(
              item._id.toString(),
              Math.abs(quantityChange),
            )
          : [];
      const unitPriceNet =
        resolveValuationUnitCost(item) ||
        line.ingredient.purchasePriceNet ||
        0;
      const movement = await this.movementModel.create({
        tenantId: order.tenantId,
        locationId: order.locationId,
        stockItemId: item._id.toString(),
        batchId: batchIds.join(',') || undefined,
        orderId: this.stringifyId(order._id),
        orderItemId: line.orderItemId,
        recipeId: this.stringifyId(line.recipe?._id) || undefined,
        menuItemId: line.menuItemId,
        extraId: line.extraId,
        referenceType: 'order',
        referenceId: this.stringifyId(order._id),
        stockItemName: item.name,
        type: movementType,
        quantityChange,
        quantity,
        unit: item.unit ?? line.ingredient.unit,
        quantityBefore: before,
        quantityAfter: item.quantity,
        unitPriceNet,
        valueNet: roundMoney(Math.abs(quantityChange) * unitPriceNet),
        note: `${notePrefix}: ${line.orderItemName} / ${this.describePlanLine(line)}`,
        reason: movementType,
        actorId,
      });
      movementIds.push(this.stringifyId(movement._id));
      await this.syncLowStockAlert(item);
    }

    return movementIds.filter(Boolean);
  }

  private requiredQuantity(
    ingredient: ConsumptionPlanLine['ingredient'],
    portions: number,
  ): number {
    return ingredient.quantity * portions * (ingredient.wasteFactor ?? 1);
  }

  private describePlanLine(line: ConsumptionPlanLine): string {
    const baseName = line.recipe?.name ?? line.extraName ?? 'Extra';

    return line.extraName && line.recipe
      ? `${baseName} / ${line.extraName}`
      : baseName;
  }

  private async hasExistingOrderMovement(
    order: InventoryOrder,
    type: StockMovementType,
  ): Promise<boolean> {
    const orderId = this.stringifyId(order._id);

    if (!orderId) {
      return false;
    }

    const existing = await this.movementModel
      .findOne({
        type,
        $or: [{ orderId }, { referenceType: 'order', referenceId: orderId }],
      })
      .select('_id')
      .lean()
      .exec();

    return Boolean(existing);
  }

  private async consumeBatches(
    stockItemId: string,
    quantity: number,
  ): Promise<string[]> {
    let remaining = quantity;
    const usedBatchIds: string[] = [];
    const batches = await this.batchModel
      .find({
        stockItemId,
        isActive: true,
        remainingQuantity: { $gt: 0 },
      })
      .sort({ expiresAt: 1, receivedAt: 1 })
      .exec();

    for (const batch of batches) {
      if (remaining <= 0) break;
      const consumed = Math.min(batch.remainingQuantity, remaining);
      batch.remainingQuantity -= consumed;
      batch.isActive = batch.remainingQuantity > 0;
      await batch.save();
      usedBatchIds.push(batch._id.toString());
      remaining -= consumed;
    }

    return usedBatchIds;
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

    await this.stockAlertModel.updateMany(
      { stockItemId, type: 'Mindestbestand', isResolved: false },
      { isResolved: true },
    );
  }

  private stringifyId(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Types.ObjectId) return value.toHexString();
    if (
      typeof value === 'object' &&
      'toString' in value &&
      value.toString !== Object.prototype.toString
    ) {
      return (value as { toString: () => string }).toString();
    }
    return '';
  }
}
