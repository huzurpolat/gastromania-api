import { Injectable } from '@nestjs/common';
import { Recipe } from './schemas/recipe.schema';

export interface RecipeCalculation {
  ingredientCost: number;
  componentCost: number;
  totalCost: number;
  costPerPortion: number;
  salePrice: number;
  grossProfit: number;
  contributionMargin: number;
  marginPercent: number;
  foodCostPercent: number;
  trafficLight: 'green' | 'yellow' | 'red';
}

@Injectable()
export class RecipeCalculationService {
  calculate(recipe: Recipe, componentCosts: number[] = []): RecipeCalculation {
    const ingredientCost = recipe.ingredients.reduce(
      (sum, ingredient) =>
        sum + ingredient.quantity * (ingredient.purchasePriceNet ?? 0),
      0,
    );
    const componentCost = componentCosts.reduce((sum, cost) => sum + cost, 0);
    const totalCost = ingredientCost + componentCost;
    const portions = recipe.basePortions || 1;
    const costPerPortion = totalCost / portions;
    const salePrice = recipe.salePrice;
    const grossProfit = salePrice - costPerPortion;
    const foodCostPercent =
      salePrice > 0 ? (costPerPortion / salePrice) * 100 : 0;
    const marginPercent = salePrice > 0 ? (grossProfit / salePrice) * 100 : 0;

    return {
      ingredientCost,
      componentCost,
      totalCost,
      costPerPortion,
      salePrice,
      grossProfit,
      contributionMargin: grossProfit,
      marginPercent,
      foodCostPercent,
      trafficLight:
        foodCostPercent <= 30
          ? 'green'
          : foodCostPercent <= 38
            ? 'yellow'
            : 'red',
    };
  }

  allergens(recipe: Recipe): string[] {
    return [
      ...new Set([
        ...recipe.ingredients.flatMap(
          (ingredient) => ingredient.allergens ?? [],
        ),
        ...(recipe.manualAllergens ?? []),
      ]),
    ].sort();
  }

  additives(recipe: Recipe): string[] {
    return [
      ...new Set([
        ...recipe.ingredients.flatMap(
          (ingredient) => ingredient.additives ?? [],
        ),
        ...(recipe.manualAdditives ?? []),
      ]),
    ].sort();
  }

  nutrition(recipe: Recipe) {
    const totals = recipe.ingredients.reduce(
      (sum, ingredient) => ({
        calories:
          sum.calories +
          (ingredient.nutrition?.calories ?? 0) * ingredient.quantity,
        fat: sum.fat + (ingredient.nutrition?.fat ?? 0) * ingredient.quantity,
        saturatedFat:
          sum.saturatedFat +
          (ingredient.nutrition?.saturatedFat ?? 0) * ingredient.quantity,
        carbs:
          sum.carbs + (ingredient.nutrition?.carbs ?? 0) * ingredient.quantity,
        sugar:
          sum.sugar + (ingredient.nutrition?.sugar ?? 0) * ingredient.quantity,
        protein:
          sum.protein +
          (ingredient.nutrition?.protein ?? 0) * ingredient.quantity,
        salt:
          sum.salt + (ingredient.nutrition?.salt ?? 0) * ingredient.quantity,
      }),
      {
        calories: 0,
        fat: 0,
        saturatedFat: 0,
        carbs: 0,
        sugar: 0,
        protein: 0,
        salt: 0,
      },
    );
    const portions = recipe.basePortions || 1;

    return Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [key, value / portions]),
    );
  }
}
