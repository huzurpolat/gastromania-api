import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order } from '../orders/schemas/order.schema';
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
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovement>,
  ) {}

  async consumeOrder(
    order: Order & { _id?: unknown },
    actorId: string,
  ): Promise<void> {
    for (const orderItem of order.items ?? []) {
      const recipe = await this.recipeModel
        .findOne({
          isActive: true,
          isArchived: { $ne: true },
          $or: [
            { name: orderItem.name },
            { menuItemId: orderItem._id?.toString() },
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
      await this.movementModel.create({
        locationId,
        stockItemId: item._id.toString(),
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

  private stringifyId(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Types.ObjectId) return value.toHexString();
    return '';
  }
}
