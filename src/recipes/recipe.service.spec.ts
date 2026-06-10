import { NotFoundException } from '@nestjs/common';
import { RecipeService } from './recipe.service';

describe('RecipeService scope handling', () => {
  const recipeModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
  };
  const menuItemModel = {
    findById: jest.fn(),
  };
  const stockItemModel = {
    find: jest.fn(),
    findById: jest.fn(),
  };
  const calculationService = {
    calculate: jest.fn().mockReturnValue({ totalCost: 1, foodCostPercent: 20 }),
    nutrition: jest.fn(),
    allergens: jest.fn(),
    additives: jest.fn(),
  };
  const inventoryService = {
    checkAvailability: jest.fn(),
  };
  const accessPolicy = {
    canAccessCompany: jest.fn(),
    canAccessLocation: jest.fn(),
    assertCanAccessLocation: jest.fn(),
    getReadableLocationIds: jest.fn(),
  };
  const actor = {
    sub: 'user-1',
    email: 'filiale@example.test',
    roles: ['Filialleiter'],
    companyId: 'company-1',
    locationIds: ['loc-1'],
  };

  let service: RecipeService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipeService(
      recipeModel as never,
      menuItemModel as never,
      stockItemModel as never,
      calculationService as never,
      inventoryService as never,
      accessPolicy as never,
    );
    accessPolicy.canAccessCompany.mockReturnValue(true);
    accessPolicy.canAccessLocation.mockResolvedValue(true);
    accessPolicy.assertCanAccessLocation.mockResolvedValue(undefined);
    accessPolicy.getReadableLocationIds.mockResolvedValue(['loc-1']);
    menuItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('filters unscoped recipes by ingredient locations', async () => {
    const visibleRecipe = recipeDocument(
      'recipe-visible',
      'Visible',
      'stock-visible',
    );
    const hiddenRecipe = recipeDocument(
      'recipe-hidden',
      'Hidden',
      'stock-hidden',
    );

    recipeModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([visibleRecipe, hiddenRecipe]),
      }),
    });
    stockItemModel.find.mockImplementation(
      (query: { _id: { $in: string[] } }) => ({
        exec: jest
          .fn()
          .mockResolvedValue(
            query._id.$in.includes('stock-hidden')
              ? [stockItemDocument('stock-hidden', 'Hidden', 'loc-2', 1)]
              : [stockItemDocument('stock-visible', 'Visible', 'loc-1', 1)],
          ),
        select: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue(
              query._id.$in.includes('stock-hidden')
                ? [{ locationId: 'loc-2' }]
                : [{ locationId: 'loc-1' }],
            ),
        }),
      }),
    );

    const recipes = await service.findAll(actor as never, {});

    expect(recipes).toHaveLength(1);
    expect(recipes[0].name).toBe('Visible');
  });

  it('hides scoped recipes outside the actor location scope', async () => {
    const recipe = recipeDocument(
      'recipe-hidden',
      'Hidden',
      'stock-hidden',
      'loc-2',
    );
    accessPolicy.canAccessLocation.mockResolvedValue(false);
    recipeModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(recipe),
    });

    await expect(
      service.findOne('recipe-hidden', actor as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('infers recipe location from ingredients on create', async () => {
    stockItemModel.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ locationId: 'loc-1' }),
      }),
    });
    stockItemModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        stockItemDocument('stock-visible', 'Burger Bun', 'loc-1', 0.4),
      ]),
    });
    recipeModel.countDocuments.mockResolvedValue(0);
    const created = {
      _id: { toString: () => 'recipe-1' },
      companyId: 'company-1',
      locationId: 'loc-1',
      recipeNumber: 'R00001',
      name: 'Burger',
      category: 'Burger',
      type: 'Speise',
      salePrice: 12,
      vatRate: 19,
      isActive: true,
      visibleInSales: true,
      productionArea: 'Küche',
      preparationTimeMinutes: 0,
      portionSize: '1 Portion',
      basePortions: 1,
      isArchived: false,
      ingredients: [
        {
          stockItemId: 'stock-visible',
          stockItemName: 'Burger Bun',
          quantity: 1,
          unit: 'Stück',
          purchasePriceNet: 0.4,
        },
      ],
      manualAllergens: [],
      manualAdditives: [],
      steps: [],
      versions: [],
      toObject: jest.fn().mockImplementation(function (this: unknown) {
        return created;
      }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    created.save.mockResolvedValue(created);
    recipeModel.create.mockResolvedValue(created);

    const recipe = await service.create(
      {
        name: 'Burger',
        category: 'Burger',
        type: 'Speise',
        salePrice: 12,
        ingredients: [
          {
            stockItemId: 'stock-visible',
            quantity: 1,
            unit: 'Stück',
          },
        ],
      } as never,
      actor as never,
    );

    expect(accessPolicy.assertCanAccessLocation).toHaveBeenCalledWith(
      actor,
      'loc-1',
    );
    expect(recipeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        locationId: 'loc-1',
        ingredients: [
          expect.objectContaining({
            stockItemName: 'Burger Bun',
            purchasePriceNet: 0.4,
          }),
        ],
      }),
    );
    expect(recipe.recipeCost).toBeCloseTo(0.4);
    expect(recipe.expectedMargin).toBeCloseTo(11.6);
  });

  it('returns structured warnings for missing cost and missing price', async () => {
    const recipe = recipeDocument(
      'recipe-warning',
      'Warning',
      'stock-free',
      'loc-1',
    );
    recipe.salePrice = 0;
    recipeModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(recipe),
    });
    stockItemModel.find.mockReturnValue({
      exec: jest
        .fn()
        .mockResolvedValue([stockItemDocument('stock-free', 'Gratis Sauce', 'loc-1', 0)]),
    });

    const response = await service.findOneResponse('recipe-warning', actor as never);

    expect(response.warnings.map((warning) => warning.type)).toEqual(
      expect.arrayContaining(['missing_cost', 'missing_price']),
    );
    expect(response.ingredients[0].warnings[0].message).toContain(
      'kein Einkaufspreis',
    );
  });

  it('rejects ingredients outside the recipe location', async () => {
    stockItemModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        stockItemDocument('stock-foreign', 'Fremde Zutat', 'loc-2', 1),
      ]),
    });

    await expect(
      service.create(
        {
          name: 'Falsche Location',
          category: 'Test',
          type: 'Speise',
          salePrice: 10,
          locationId: 'loc-1',
          ingredients: [
            {
              stockItemId: 'stock-foreign',
              quantity: 1,
              unit: 'kg',
            },
          ],
        } as never,
        actor as never,
      ),
    ).rejects.toThrow('Rezeptstandort');
  });

  it('rejects foreign menu items when scoped tenant metadata exists', async () => {
    menuItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => 'menu-foreign' },
        tenantId: 'company-2',
        name: 'Fremder Burger',
        price: 10,
      }),
    });
    accessPolicy.canAccessCompany.mockReturnValue(false);

    await expect(
      service.create(
        {
          name: 'Fremder Artikel',
          category: 'Test',
          type: 'Speise',
          salePrice: 10,
          menuItemId: 'menu-foreign',
          ingredients: [],
        } as never,
        actor as never,
      ),
    ).rejects.toThrow('Verkaufsartikel');
  });

  it('rejects non-positive ingredient quantities', async () => {
    await expect(
      service.create(
        {
          name: 'Nullmenge',
          category: 'Test',
          type: 'Speise',
          salePrice: 10,
          ingredients: [
            {
              stockItemId: 'stock-visible',
              quantity: 0,
              unit: 'kg',
            },
          ],
        } as never,
        actor as never,
      ),
    ).rejects.toThrow('groesser als 0');
  });

  function recipeDocument(
    id: string,
    name: string,
    stockItemId: string,
    locationId?: string,
  ) {
    return {
      _id: { toString: () => id },
      companyId: 'company-1',
      locationId,
      recipeNumber: id,
      name,
      category: 'Food',
      salePrice: 12,
      isArchived: false,
      ingredients: [
        {
          stockItemId,
          stockItemName: stockItemId,
          quantity: 1,
          unit: 'Stueck',
        },
      ],
      toObject: () => ({
        _id: id,
        companyId: 'company-1',
        locationId,
        recipeNumber: id,
        name,
        category: 'Food',
        salePrice: 12,
        ingredients: [
          {
            stockItemId,
            stockItemName: stockItemId,
            quantity: 1,
            unit: 'Stueck',
          },
        ],
      }),
    };
  }

  function stockItemDocument(
    id: string,
    name: string,
    locationId: string,
    purchasePriceNet: number,
  ) {
    return {
      _id: { toString: () => id },
      locationId,
      name,
      unit: 'Stück',
      purchasePriceNet,
      averageCost: 0,
      unitCost: 0,
      lastPurchasePrice: 0,
    };
  }
});
