/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { RecipeInventoryService } from './recipe-inventory.service';
import { StockMovementType } from '../stock/schemas/stock-movement.schema';

describe('RecipeInventoryService', () => {
  const recipeModel = {
    findOne: jest.fn(),
  };
  const stockItemModel = {
    findById: jest.fn(),
  };
  const batchModel = {
    find: jest.fn(),
  };
  const movementModel = {
    create: jest.fn(),
    findOne: jest.fn(),
  };
  const stockAlertModel = {
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  };
  let service: RecipeInventoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipeInventoryService(
      recipeModel as never,
      stockItemModel as never,
      batchModel as never,
      movementModel as never,
      stockAlertModel as never,
    );
    batchModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });
    movementModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      }),
    });
  });

  it('subtracts ingredient quantities when an order item matches a recipe', async () => {
    const recipe = {
      _id: { toString: () => 'recipe-burger' },
      name: 'Burger',
      ingredients: [
        {
          stockItemId: 'stock-1',
          stockItemName: 'Patty',
          quantity: 2,
          unit: 'Stueck',
          purchasePriceNet: 1.5,
        },
      ],
    };
    const item = {
      _id: { toString: () => 'stock-1' },
      locationId: 'loc-1',
      name: 'Patty',
      quantity: 10,
      purchasePriceNet: 1.5,
      save: jest.fn().mockResolvedValue(undefined),
    };
    recipeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(recipe),
    });
    stockItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(item),
    });
    movementModel.create.mockResolvedValue({});

    await service.consumeOrder(
      {
        _id: 'order-1',
        locationId: 'loc-1',
        tenantId: 'tenant-1',
        items: [{ name: 'Burger', quantity: 3 }],
      } as never,
      'user-1',
    );

    expect(item.quantity).toBe(4);
    expect(item.save).toHaveBeenCalled();
    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: 'loc-1',
        tenantId: 'tenant-1',
        stockItemName: 'Patty',
        type: StockMovementType.OrderConsumption,
        referenceType: 'order',
        referenceId: 'order-1',
        quantity: 6,
        unit: 'Stueck',
        quantityChange: -6,
        quantityBefore: 10,
        quantityAfter: 4,
        actorId: 'user-1',
      }),
    );
  });

  it('allows negative stock and creates a low-stock alert when ingredients are unavailable', async () => {
    const recipe = {
      _id: { toString: () => 'recipe-burger' },
      name: 'Burger',
      ingredients: [
        {
          stockItemId: 'stock-1',
          stockItemName: 'Patty',
          quantity: 2,
          unit: 'Stueck',
          purchasePriceNet: 1.5,
        },
      ],
    };
    recipeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(recipe),
    });
    const item = {
      _id: { toString: () => 'stock-1' },
      locationId: 'loc-1',
      tenantId: 'tenant-1',
      name: 'Patty',
      quantity: 1,
      minQuantity: 2,
      criticalQuantity: 0,
      unit: 'Stueck',
      isActive: true,
      isArchived: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    stockItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(item),
    });
    movementModel.create.mockResolvedValue({});

    await service.consumeOrder(
      {
        _id: 'order-1',
        locationId: 'loc-1',
        tenantId: 'tenant-1',
        items: [{ name: 'Burger', quantity: 1 }],
      } as never,
      'user-1',
    );

    expect(item.quantity).toBe(-1);
    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: StockMovementType.OrderConsumption,
        quantityChange: -2,
        quantityBefore: 1,
        quantityAfter: -1,
      }),
    );
    expect(stockAlertModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stockItemId: 'stock-1',
        type: 'Mindestbestand',
      }),
      expect.objectContaining({ severity: 'critical' }),
      expect.objectContaining({ upsert: true }),
    );
  });

  it('matches recipes by menu item id before falling back to the item name', async () => {
    const recipe = {
      _id: { toString: () => 'recipe-cheeseburger' },
      name: 'Cheeseburger Rezept',
      ingredients: [
        {
          stockItemId: 'stock-bun',
          stockItemName: 'Burger Bun',
          quantity: 1,
          unit: 'Stueck',
          purchasePriceNet: 0.4,
        },
      ],
    };
    const item = {
      _id: { toString: () => 'stock-bun' },
      locationId: 'loc-1',
      tenantId: 'tenant-1',
      name: 'Burger Bun',
      quantity: 5,
      purchasePriceNet: 0.4,
      save: jest.fn().mockResolvedValue(undefined),
    };
    recipeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(recipe),
    });
    stockItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(item),
    });
    movementModel.create.mockResolvedValue({});

    await service.consumeOrder(
      {
        _id: 'order-2',
        locationId: 'loc-1',
        tenantId: 'tenant-1',
        items: [
          {
            menuItemId: 'menu-cheeseburger',
            productId: 'legacy-id',
            name: 'Cheeseburger',
            quantity: 2,
          },
        ],
      } as never,
      'user-1',
    );

    expect(recipeModel.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          { menuItemId: 'menu-cheeseburger' },
          { name: 'Cheeseburger' },
        ]),
      }),
    );
    expect(item.quantity).toBe(3);
    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-2',
        menuItemId: 'menu-cheeseburger',
        referenceType: 'order',
        referenceId: 'order-2',
        type: StockMovementType.OrderConsumption,
        quantityChange: -2,
        quantityAfter: 3,
      }),
    );
  });

  it('deducts all ingredients for multiple order items with multiplied quantities', async () => {
    const burgerRecipe = {
      _id: { toString: () => 'recipe-burger' },
      name: 'Cheese Burger',
      ingredients: [
        {
          stockItemId: 'stock-bun',
          stockItemName: 'Burger Bun',
          quantity: 1,
          unit: 'Stueck',
          purchasePriceNet: 0.4,
        },
        {
          stockItemId: 'stock-cheese',
          stockItemName: 'Kaese',
          quantity: 1,
          unit: 'Scheibe',
          purchasePriceNet: 0.2,
        },
      ],
    };
    const friesRecipe = {
      _id: { toString: () => 'recipe-fries' },
      name: 'Pommes',
      ingredients: [
        {
          stockItemId: 'stock-potato',
          stockItemName: 'Kartoffeln',
          quantity: 0.25,
          unit: 'kg',
          purchasePriceNet: 1,
        },
      ],
    };
    const stockItems = new Map<string, { quantity: number; [key: string]: unknown }>([
      [
        'stock-bun',
        {
          _id: { toString: () => 'stock-bun' },
          locationId: 'loc-1',
          tenantId: 'tenant-1',
          name: 'Burger Bun',
          unit: 'Stueck',
          quantity: 10,
          purchasePriceNet: 0.4,
          save: jest.fn().mockResolvedValue(undefined),
        },
      ],
      [
        'stock-cheese',
        {
          _id: { toString: () => 'stock-cheese' },
          locationId: 'loc-1',
          tenantId: 'tenant-1',
          name: 'Kaese',
          unit: 'Scheibe',
          quantity: 10,
          purchasePriceNet: 0.2,
          save: jest.fn().mockResolvedValue(undefined),
        },
      ],
      [
        'stock-potato',
        {
          _id: { toString: () => 'stock-potato' },
          locationId: 'loc-1',
          tenantId: 'tenant-1',
          name: 'Kartoffeln',
          unit: 'kg',
          quantity: 5,
          purchasePriceNet: 1,
          save: jest.fn().mockResolvedValue(undefined),
        },
      ],
    ]);

    recipeModel.findOne.mockImplementation((query: { $or: Array<Record<string, string>> }) => ({
      exec: jest.fn().mockResolvedValue(
        query.$or.some((entry) => entry.menuItemId === 'menu-burger')
          ? burgerRecipe
          : friesRecipe,
      ),
    }));
    stockItemModel.findById.mockImplementation((id: string) => ({
      exec: jest.fn().mockResolvedValue(stockItems.get(id)),
    }));
    movementModel.create.mockImplementation((payload: unknown) =>
      Promise.resolve({ _id: { toString: () => JSON.stringify(payload) } }),
    );

    await service.consumeOrder(
      {
        _id: 'order-3',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        items: [
          { menuItemId: 'menu-burger', name: 'Cheese Burger', quantity: 2 },
          { menuItemId: 'menu-fries', name: 'Pommes', quantity: 3 },
        ],
      } as never,
      'user-1',
    );

    expect(stockItems.get('stock-bun')?.quantity).toBe(8);
    expect(stockItems.get('stock-cheese')?.quantity).toBe(8);
    expect(stockItems.get('stock-potato')?.quantity).toBe(4.25);
    expect(movementModel.create).toHaveBeenCalledTimes(3);
    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stockItemId: 'stock-potato',
        quantityChange: -0.75,
        quantity: 0.75,
        unit: 'kg',
      }),
    );
  });

  it('adds selected extra inventory impact to stock movements and COGS value', async () => {
    const recipe = {
      _id: { toString: () => 'recipe-burger' },
      name: 'Cheese Burger Rezept',
      ingredients: [
        {
          stockItemId: 'stock-cheese',
          stockItemName: 'Kaese',
          quantity: 1,
          unit: 'Scheibe',
          purchasePriceNet: 0.2,
        },
      ],
    };
    const cheese = {
      _id: { toString: () => 'stock-cheese' },
      locationId: 'loc-1',
      tenantId: 'tenant-1',
      name: 'Kaese',
      unit: 'Scheibe',
      quantity: 10,
      averageCost: 0.3,
      purchasePriceNet: 0.2,
      save: jest.fn().mockResolvedValue(undefined),
    };

    recipeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(recipe),
    });
    stockItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(cheese),
    });
    movementModel.create.mockImplementation((payload: { extraId?: string }) =>
      Promise.resolve({
        _id: { toString: () => (payload.extraId ? 'movement-extra' : 'movement-base') },
      }),
    );

    const result = await service.consumeOrder(
      {
        _id: 'order-extra-cheese',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        items: [
          {
            _id: { toString: () => 'order-item-1' },
            menuItemId: 'menu-burger',
            name: 'Cheese Burger',
            quantity: 2,
            selectedExtras: [
              {
                extraId: 'extra-cheese',
                name: 'Extra Kaese',
                priceDelta: 1,
                sendToKitchen: true,
                inventoryImpact: [
                  {
                    stockItemId: 'stock-cheese',
                    stockItemName: 'Kaese',
                    quantity: 1,
                    unit: 'Scheibe',
                  },
                ],
              },
            ],
          },
        ],
      } as never,
      'user-1',
    );

    expect(result.movementIds).toEqual(['movement-base', 'movement-extra']);
    expect(cheese.quantity).toBe(6);
    expect(movementModel.create).toHaveBeenCalledTimes(2);
    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stockItemId: 'stock-cheese',
        recipeId: 'recipe-burger',
        extraId: undefined,
        quantityChange: -2,
        valueNet: 0.6,
      }),
    );
    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        stockItemId: 'stock-cheese',
        recipeId: 'recipe-burger',
        extraId: 'extra-cheese',
        quantityChange: -2,
        valueNet: 0.6,
        note: 'Automatischer Zutatenverbrauch: Cheese Burger / Cheese Burger Rezept / Extra Kaese',
      }),
    );
  });

  it('deducts extra inventory impact even when the menu item has no recipe', async () => {
    const patty = {
      _id: { toString: () => 'stock-patty' },
      locationId: 'loc-1',
      tenantId: 'tenant-1',
      name: 'Patty',
      unit: 'Stueck',
      quantity: 5,
      unitCost: 1.25,
      save: jest.fn().mockResolvedValue(undefined),
    };

    recipeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    stockItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(patty),
    });
    movementModel.create.mockResolvedValue({
      _id: { toString: () => 'movement-extra-patty' },
    });

    const result = await service.consumeOrder(
      {
        _id: 'order-extra-only',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        items: [
          {
            _id: { toString: () => 'order-item-extra-only' },
            menuItemId: 'menu-burger',
            name: 'Burger',
            quantity: 2,
            selectedExtras: [
              {
                extraId: 'extra-patty',
                name: 'Extra Patty',
                priceDelta: 3.5,
                sendToKitchen: true,
                inventoryImpact: [
                  {
                    stockItemId: 'stock-patty',
                    stockItemName: 'Patty',
                    quantity: 1,
                    unit: 'Stueck',
                  },
                ],
              },
            ],
          },
        ],
      } as never,
      'user-1',
    );

    expect(result.warnings).toContain('Kein Rezept fuer Burger gefunden.');
    expect(result.movementIds).toEqual(['movement-extra-patty']);
    expect(patty.quantity).toBe(3);
    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipeId: undefined,
        extraId: 'extra-patty',
        quantityChange: -2,
        valueNet: 2.5,
        note: 'Automatischer Zutatenverbrauch: Burger / Extra Patty',
      }),
    );
  });

  it('does not fail an order when a recipe is missing', async () => {
    recipeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    const result = await service.consumeOrder(
      {
        _id: 'order-missing-recipe',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        items: [{ menuItemId: 'menu-unknown', name: 'Unbekannt', quantity: 1 }],
      } as never,
      'user-1',
    );

    expect(result.movementIds).toEqual([]);
    expect(result.warnings).toContain('Kein Rezept fuer Unbekannt gefunden.');
    expect(movementModel.create).not.toHaveBeenCalled();
  });

  it('does not deduct twice when stock movements already exist for the order', async () => {
    movementModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ _id: 'movement-1' }),
        }),
      }),
    });

    const result = await service.consumeOrder(
      {
        _id: 'order-duplicate',
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        items: [{ name: 'Burger', quantity: 1 }],
      } as never,
      'user-1',
    );

    expect(result.movementIds).toEqual([]);
    expect(result.warnings).toContain(
      'Bestellung wurde bereits vom Lager abgezogen.',
    );
    expect(recipeModel.findOne).not.toHaveBeenCalled();
    expect(movementModel.create).not.toHaveBeenCalled();
  });

  it('rejects cross-location stock deduction', async () => {
    recipeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        name: 'Burger',
        ingredients: [
          {
            stockItemId: 'stock-foreign-location',
            stockItemName: 'Patty',
            quantity: 1,
            unit: 'Stueck',
          },
        ],
      }),
    });
    stockItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => 'stock-foreign-location' },
        locationId: 'loc-2',
        tenantId: 'tenant-1',
        name: 'Patty',
        quantity: 10,
        unit: 'Stueck',
      }),
    });

    await expect(
      service.consumeOrder(
        {
          _id: 'order-cross-location',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          items: [{ name: 'Burger', quantity: 1 }],
        } as never,
        'user-1',
      ),
    ).rejects.toThrow('Zutat Patty gehoert nicht zum Standort der Bestellung');
  });

  it('rejects cross-tenant stock deduction when stock tenant is known', async () => {
    recipeModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        name: 'Burger',
        ingredients: [
          {
            stockItemId: 'stock-foreign-tenant',
            stockItemName: 'Patty',
            quantity: 1,
            unit: 'Stueck',
          },
        ],
      }),
    });
    stockItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: { toString: () => 'stock-foreign-tenant' },
        locationId: 'loc-1',
        tenantId: 'tenant-2',
        name: 'Patty',
        quantity: 10,
        unit: 'Stueck',
      }),
    });

    await expect(
      service.consumeOrder(
        {
          _id: 'order-cross-tenant',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          items: [{ name: 'Burger', quantity: 1 }],
        } as never,
        'user-1',
      ),
    ).rejects.toThrow('Zutat Patty gehoert nicht zum Tenant der Bestellung');
  });
});
