import { BadRequestException } from '@nestjs/common';
import { RecipeInventoryService } from './recipe-inventory.service';

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
  };
  let service: RecipeInventoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecipeInventoryService(
      recipeModel as never,
      stockItemModel as never,
      batchModel as never,
      movementModel as never,
    );
    batchModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    });
  });

  it('subtracts ingredient quantities when an order item matches a recipe', async () => {
    const recipe = {
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
        items: [{ name: 'Burger', quantity: 3 }],
      } as never,
      'user-1',
    );

    expect(item.quantity).toBe(4);
    expect(item.save).toHaveBeenCalled();
    expect(movementModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: 'loc-1',
        stockItemName: 'Patty',
        quantityChange: -6,
        quantityBefore: 10,
        quantityAfter: 4,
        actorId: 'user-1',
      }),
    );
  });

  it('rejects consumption when ingredients are unavailable', async () => {
    const recipe = {
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
    stockItemModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ locationId: 'loc-1', quantity: 1 }),
    });

    await expect(
      service.consumeOrder(
        {
          _id: 'order-1',
          locationId: 'loc-1',
          items: [{ name: 'Burger', quantity: 1 }],
        } as never,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('matches recipes by menu item id before falling back to the item name', async () => {
    const recipe = {
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
        items: [{ menuItemId: 'menu-cheeseburger', productId: 'legacy-id', name: 'Cheeseburger', quantity: 2 }],
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
        quantityChange: -2,
        quantityAfter: 3,
      }),
    );
  });
});
