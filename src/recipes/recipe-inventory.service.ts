import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order } from '../orders/schemas/order.schema';
import { InventoryBatch } from '../stock/schemas/inventory-batch.schema';
import { StockItem } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementType,
} from '../stock/schemas/stock-movement.schema';
import { Recipe } from './schemas/recipe.schema';

@Injectable()
export class RecipeInventoryService {
  constructor(
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItem>,
    @InjectModel(InventoryBatch.name)
    private readonly batchModel: Model<InventoryBatch>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovement>,
  ) {}

  async consumeOrder(
    order: Order & { _id?: unknown; inventoryConsumedAt?: Date },
    actorId: string,
  ): Promise<void> {
    if (order.inventoryConsumedAt) {
      return;
    }

    for (const orderItem of order.items ?? []) {
      const menuItemId = orderItem.menuItemId ?? orderItem.productId;
      const recipe = await this.recipeModel
        .findOne({
          isActive: true,
          isArchived: { $ne: true },
          $or: [
            ...(menuItemId ? [{ menuItemId }] : []),
            { name: orderItem.name },
          ],
        })
        .exec();

      if (!recipe) continue;

      await this.consumeRecipe(
        recipe,
        order.locationId,
        orderItem.quantity,
        actorId,
        this.stringifyId(order._id),
      );
    }
  }

  async reverseOrder(
    order: Order & { _id?: unknown; inventoryReversedAt?: Date },
    actorId: string,
  ): Promise<void> {
    if (order.inventoryReversedAt) {
      return;
    }

    for (const orderItem of order.items ?? []) {
      const menuItemId = orderItem.menuItemId ?? orderItem.productId;
      const recipe = await this.recipeModel
        .findOne({
          isActive: true,
          isArchived: { $ne: true },
          $or: [
            ...(menuItemId ? [{ menuItemId }] : []),
            { name: orderItem.name },
          ],
        })
        .exec();

      if (!recipe) continue;

      await this.reverseRecipe(
        recipe,
        order.locationId,
        orderItem.quantity,
        actorId,
        this.stringifyId(order._id),
      );
    }
  }

  async checkAvailability(recipe: Recipe, locationId: string, portions = 1) {
    const missing = [];
    for (const ingredient of recipe.ingredients) {
      const item = await this.stockItemModel
        .findById(ingredient.stockItemId)
        .exec();
      const required = ingredient.quantity * portions;
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

  private async consumeRecipe(
    recipe: Recipe,
    locationId: string,
    quantity: number,
    actorId: string,
    orderId: string,
  ) {
    const availability = await this.checkAvailability(
      recipe,
      locationId,
      quantity,
    );
    if (!availability.available) {
      throw new BadRequestException({
        message: 'Nicht genuegend Zutaten verfuegbar',
        missing: availability.missing,
      });
    }

    for (const ingredient of recipe.ingredients) {
      const item = await this.stockItemModel
        .findById(ingredient.stockItemId)
        .exec();
      if (!item) continue;
      const quantityChange = -1 * ingredient.quantity * quantity;
      const before = item.quantity;
      item.quantity = before + quantityChange;
      await item.save();
      const batchIds = await this.consumeBatches(
        item._id.toString(),
        Math.abs(quantityChange),
      );
      await this.movementModel.create({
        locationId,
        stockItemId: item._id.toString(),
        batchId: batchIds.join(',') || undefined,
        orderId,
        stockItemName: item.name,
        type: StockMovementType.Usage,
        quantityChange,
        quantityBefore: before,
        quantityAfter: item.quantity,
        unitPriceNet: item.purchasePriceNet ?? ingredient.purchasePriceNet ?? 0,
        valueNet:
          Math.abs(quantityChange) *
          (item.purchasePriceNet ?? ingredient.purchasePriceNet ?? 0),
        note: `Automatische Rezeptabbuchung ${recipe.name} / Bestellung ${orderId}`,
        actorId,
      });
    }
  }

  private async reverseRecipe(
    recipe: Recipe,
    locationId: string,
    quantity: number,
    actorId: string,
    orderId: string,
  ): Promise<void> {
    for (const ingredient of recipe.ingredients) {
      const item = await this.stockItemModel
        .findById(ingredient.stockItemId)
        .exec();
      if (!item) continue;
      const quantityChange = ingredient.quantity * quantity;
      const before = item.quantity;
      item.quantity = before + quantityChange;
      await item.save();
      await this.movementModel.create({
        locationId,
        stockItemId: item._id.toString(),
        orderId,
        stockItemName: item.name,
        type: StockMovementType.Correction,
        quantityChange,
        quantityBefore: before,
        quantityAfter: item.quantity,
        unitPriceNet: item.purchasePriceNet ?? ingredient.purchasePriceNet ?? 0,
        valueNet:
          Math.abs(quantityChange) *
          (item.purchasePriceNet ?? ingredient.purchasePriceNet ?? 0),
        note: `Automatische Rezept-Rueckbuchung ${recipe.name} / Storno ${orderId}`,
        reason: 'Bestellung storniert',
        actorId,
      });
    }
  }

  private async consumeBatches(stockItemId: string, quantity: number): Promise<string[]> {
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

  private stringifyId(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Types.ObjectId) return value.toHexString();
    return '';
  }
}
