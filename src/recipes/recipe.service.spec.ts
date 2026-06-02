import { NotFoundException } from '@nestjs/common';
import { RecipeService } from './recipe.service';

describe('RecipeService scope handling', () => {
  const recipeModel = {
    find: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    countDocuments: jest.fn(),
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
      stockItemModel as never,
      calculationService as never,
      inventoryService as never,
      accessPolicy as never,
    );
    accessPolicy.canAccessCompany.mockResolvedValue(true);
    accessPolicy.canAccessLocation.mockResolvedValue(true);
    accessPolicy.assertCanAccessLocation.mockResolvedValue(undefined);
    accessPolicy.getReadableLocationIds.mockResolvedValue(['loc-1']);
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
    recipeModel.countDocuments.mockResolvedValue(0);
    const created = {
      companyId: 'company-1',
      locationId: 'loc-1',
      versions: [],
      toObject: jest.fn().mockReturnValue({ name: 'Burger' }),
      save: jest.fn().mockResolvedValue({ _id: 'recipe-1' }),
    };
    recipeModel.create.mockResolvedValue(created);

    await service.create(
      {
        name: 'Burger',
        category: 'Burger',
        type: 'Speise',
        salePrice: 12,
        ingredients: [
          {
            stockItemId: 'stock-visible',
            stockItemName: 'Burger Bun',
            quantity: 1,
            unit: 'Stueck',
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
      }),
    );
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
});
