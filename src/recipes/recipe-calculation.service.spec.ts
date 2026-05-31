import { RecipeCalculationService } from './recipe-calculation.service';
import { Recipe, RecipeType } from './schemas/recipe.schema';

describe('RecipeCalculationService', () => {
  const service = new RecipeCalculationService();

  const recipe: Recipe = {
    recipeNumber: 'R00001',
    name: 'Pasta Test',
    category: 'Food',
    type: RecipeType.Food,
    salePrice: 12,
    vatRate: 19,
    isActive: true,
    visibleInSales: true,
    productionArea: 'Küche' as Recipe['productionArea'],
    preparationTimeMinutes: 12,
    portionSize: '1 Portion',
    basePortions: 2,
    isArchived: false,
    ingredients: [
      {
        stockItemId: 'stock-1',
        stockItemName: 'Nudeln',
        quantity: 0.2,
        unit: 'kg',
        purchasePriceNet: 4,
        allergens: ['Gluten'],
        additives: [],
        nutrition: {
          calories: 350,
          fat: 1,
          saturatedFat: 0,
          carbs: 70,
          sugar: 2,
          protein: 12,
          salt: 0.1,
        },
      },
      {
        stockItemId: 'stock-2',
        stockItemName: 'Sahne',
        quantity: 0.1,
        unit: 'l',
        purchasePriceNet: 3,
        allergens: ['Milch'],
        additives: ['Stabilisator'],
        nutrition: {
          calories: 200,
          fat: 20,
          saturatedFat: 12,
          carbs: 4,
          sugar: 3,
          protein: 2,
          salt: 0.2,
        },
      },
    ],
    variants: [],
    options: [],
    components: [],
    manualAllergens: ['Ei'],
    manualAdditives: [],
    steps: [],
    versions: [],
  };

  it('calculates food cost and margin per base portion', () => {
    const result = service.calculate(recipe);

    expect(result.totalCost).toBeCloseTo(1.1);
    expect(result.costPerPortion).toBeCloseTo(0.55);
    expect(result.grossProfit).toBeCloseTo(11.45);
    expect(result.foodCostPercent).toBeCloseTo(4.58, 1);
    expect(result.trafficLight).toBe('green');
  });

  it('combines ingredient and manual allergens', () => {
    expect(service.allergens(recipe)).toEqual(['Ei', 'Gluten', 'Milch']);
    expect(service.additives(recipe)).toEqual(['Stabilisator']);
  });

  it('normalizes nutrition per portion', () => {
    const nutrition = service.nutrition(recipe);

    expect(nutrition.calories).toBeCloseTo(45);
    expect(nutrition.fat).toBeCloseTo(1.1);
    expect(nutrition.protein).toBeCloseTo(1.3);
  });
});
