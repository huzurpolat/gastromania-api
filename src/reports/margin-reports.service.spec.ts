/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenException } from '@nestjs/common';
import { Role } from '../auth/enums/role.enum';
import { OrderStatus } from '../orders/schemas/order.schema';
import { StockMovementType } from '../stock/schemas/stock-movement.schema';
import { MarginReportsService } from './margin-reports.service';

const leanModel = <T>(items: T[]) => ({
  find: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(items) })),
});

describe('MarginReportsService', () => {
  const user = {
    sub: 'manager-1',
    email: 'filialleiter@bonn.local',
    roles: [Role.Filialleiter],
    permissions: ['reports.view'],
    tenantId: 'tenant-1',
    locationIds: ['loc-1'],
  };
  const location = {
    _id: 'loc-1',
    name: 'Bonn',
    city: 'Bonn',
    tenantId: 'tenant-1',
    isActive: true,
  };
  const createService = (data: {
    orders?: unknown[];
    menuItems?: unknown[];
    recipes?: unknown[];
    stockItems?: unknown[];
    stockMovements?: unknown[];
  }) => {
    const orderModel = leanModel(data.orders ?? []);
    const menuItemModel = leanModel(data.menuItems ?? []);
    const recipeModel = leanModel(data.recipes ?? []);
    const stockItemModel = leanModel(data.stockItems ?? []);
    const stockMovementModel = leanModel(data.stockMovements ?? []);
    const locationModel = leanModel([location]);
    const analysisRunModel = {
      create: jest.fn().mockResolvedValue({ _id: 'run-1' }),
    };
    const accessPolicy = {
      getReadableLocationIds: jest.fn().mockResolvedValue(['loc-1']),
      canAccessCompany: jest.fn().mockResolvedValue(true),
      canAccessRegion: jest.fn().mockResolvedValue(true),
      assertCanAccessLocation: jest.fn().mockResolvedValue(undefined),
    };

    return {
      service: new MarginReportsService(
        orderModel as never,
        menuItemModel as never,
        recipeModel as never,
        stockItemModel as never,
        stockMovementModel as never,
        locationModel as never,
        analysisRunModel as never,
        accessPolicy as never,
      ),
      orderModel,
      stockMovementModel,
      analysisRunModel,
    };
  };

  it('calculates COGS, contribution margin and margin percent from stock movements', async () => {
    const { service } = createService({
      orders: [
        {
          _id: 'order-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          status: OrderStatus.Accepted,
          createdAt: new Date(),
          items: [
            {
              menuItemId: 'menu-1',
              name: 'Cheeseburger',
              quantity: 2,
              price: 12.9,
            },
          ],
        },
      ],
      menuItems: [
        {
          _id: 'menu-1',
          name: 'Cheeseburger',
          category: 'Burger',
          price: 12.9,
          targetMargin: 70,
          isActive: true,
        },
      ],
      recipes: [
        {
          _id: 'recipe-1',
          menuItemId: 'menu-1',
          name: 'Cheeseburger',
          category: 'Burger',
          salePrice: 12.9,
          basePortions: 1,
          ingredients: [
            {
              stockItemId: 'bun',
              stockItemName: 'Burger Bun',
              quantity: 1,
              unit: 'Stueck',
              wasteFactor: 1,
            },
            {
              stockItemId: 'beef',
              stockItemName: 'Rindfleisch',
              quantity: 1,
              unit: 'Portion',
              wasteFactor: 1,
            },
            {
              stockItemId: 'cheese',
              stockItemName: 'Kaese',
              quantity: 1,
              unit: 'Scheibe',
              wasteFactor: 1,
            },
            {
              stockItemId: 'salad',
              stockItemName: 'Salat',
              quantity: 1,
              unit: 'Portion',
              wasteFactor: 1,
            },
            {
              stockItemId: 'sauce',
              stockItemName: 'Sauce',
              quantity: 1,
              unit: 'Portion',
              wasteFactor: 1,
            },
          ],
        },
      ],
      stockItems: [
        {
          _id: 'bun',
          locationId: 'loc-1',
          name: 'Burger Bun',
          averageCost: 0.45,
        },
        {
          _id: 'beef',
          locationId: 'loc-1',
          name: 'Rindfleisch',
          averageCost: 2.1,
        },
        {
          _id: 'cheese',
          locationId: 'loc-1',
          name: 'Kaese',
          averageCost: 0.35,
        },
        { _id: 'salad', locationId: 'loc-1', name: 'Salat', averageCost: 0.2 },
        { _id: 'sauce', locationId: 'loc-1', name: 'Sauce', averageCost: 0.15 },
      ],
      stockMovements: [
        {
          _id: 'movement-bun',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'menu-1',
          recipeId: 'recipe-1',
          stockItemId: 'bun',
          stockItemName: 'Burger Bun',
          quantity: 2,
          unit: 'Stueck',
          quantityChange: -2,
          valueNet: 0.9,
        },
        {
          _id: 'movement-beef',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'menu-1',
          recipeId: 'recipe-1',
          stockItemId: 'beef',
          stockItemName: 'Rindfleisch',
          quantity: 2,
          unit: 'Portion',
          quantityChange: -2,
          valueNet: 4.2,
        },
        {
          _id: 'movement-cheese',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'menu-1',
          recipeId: 'recipe-1',
          stockItemId: 'cheese',
          stockItemName: 'Kaese',
          quantity: 2,
          unit: 'Scheibe',
          quantityChange: -2,
          valueNet: 0.7,
        },
        {
          _id: 'movement-salad',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'menu-1',
          recipeId: 'recipe-1',
          stockItemId: 'salad',
          stockItemName: 'Salat',
          quantity: 2,
          unit: 'Portion',
          quantityChange: -2,
          valueNet: 0.4,
        },
        {
          _id: 'movement-sauce',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'menu-1',
          recipeId: 'recipe-1',
          stockItemId: 'sauce',
          stockItemName: 'Sauce',
          quantity: 2,
          unit: 'Portion',
          quantityChange: -2,
          valueNet: 0.3,
        },
      ],
    });

    const report = await service.getMargins(user, { range: 'today' });
    const burger = report.menuItems[0];

    expect(burger.recipeCost).toBeCloseTo(3.25);
    expect(burger.costOfGoods).toBeCloseTo(6.5);
    expect(burger.contributionMargin).toBeCloseTo(9.65);
    expect(burger.marginPercent).toBeCloseTo(74.8, 1);
    expect(burger.costBasis).toEqual(['stockMovementValueNet']);
    expect(burger.ingredientCosts).toHaveLength(5);
    expect(report.summary.revenue).toBeCloseTo(25.8);
    expect(report.summary.contributionMargin).toBeCloseTo(19.3);
    expect(report.summary.grossMargin).toBeCloseTo(19.3);
    expect(report.summary.marginPercent).toBeCloseTo(74.8, 1);
    expect(report.costBasis).toBe('StockMovement.valueNet');
    expect(report.items[0].label).toBe('Cheeseburger');
    expect(report.items[0].revenue).toBeCloseTo(25.8);
    expect(report.items[0].costOfGoods).toBeCloseTo(6.5);
    expect(report.items[0].grossMargin).toBeCloseTo(19.3);
  });

  it('uses only sent or completed order statuses and excludes cancelled orders in the query', async () => {
    const { service, orderModel } = createService({});

    await service.getMargins(user, { range: 'today' });

    expect(orderModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        status: {
          $in: expect.not.arrayContaining([
            OrderStatus.Cancelled,
            OrderStatus.Draft,
            OrderStatus.New,
          ]),
        },
      }),
    );
  });

  it('returns warnings for missing recipes and missing stock movement costs', async () => {
    const { service } = createService({
      orders: [
        {
          _id: 'order-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          status: OrderStatus.Accepted,
          createdAt: new Date(),
          items: [
            { menuItemId: 'menu-1', name: 'Cola', quantity: 1, price: 3.5 },
          ],
        },
      ],
      menuItems: [
        {
          _id: 'menu-1',
          name: 'Cola',
          category: 'Getraenke',
          price: 3.5,
          isActive: true,
        },
      ],
      stockMovements: [
        {
          _id: 'movement-missing-cost',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'menu-1',
          stockItemId: 'cola-syrup',
          stockItemName: 'Cola Sirup',
          quantity: 1,
          unit: 'Portion',
          quantityChange: -1,
          valueNet: 0,
        },
      ],
    });

    const report = await service.getMargins(user, { range: 'today' });

    expect(report.menuItems[0].status).toBe('missing_recipe');
    expect(report.warnings.join(' ')).toContain('kein Rezept');
    expect(report.warnings.join(' ')).toContain('Missing stock cost');
    expect(report.warningDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'missing_recipe' }),
        expect.objectContaining({ type: 'missing_stock_movement_cost' }),
      ]),
    );
  });

  it('groups report items by category when requested', async () => {
    const { service } = createService({
      orders: [
        {
          _id: 'order-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          status: OrderStatus.Accepted,
          createdAt: new Date(),
          items: [
            { menuItemId: 'menu-1', name: 'Burger', quantity: 1, price: 10 },
            { menuItemId: 'menu-2', name: 'Pommes', quantity: 1, price: 5 },
          ],
        },
      ],
      menuItems: [
        {
          _id: 'menu-1',
          name: 'Burger',
          category: 'Food',
          price: 10,
          isActive: true,
        },
        {
          _id: 'menu-2',
          name: 'Pommes',
          category: 'Food',
          price: 5,
          isActive: true,
        },
      ],
      stockMovements: [
        {
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'menu-1',
          stockItemId: 'beef',
          stockItemName: 'Beef',
          quantity: 1,
          unit: 'x',
          quantityChange: -1,
          valueNet: 3,
        },
        {
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'menu-2',
          stockItemId: 'potato',
          stockItemName: 'Kartoffel',
          quantity: 1,
          unit: 'x',
          quantityChange: -1,
          valueNet: 1,
        },
      ],
    });

    const report = await service.getMargins(user, {
      range: 'today',
      groupBy: 'category',
    });

    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toEqual(
      expect.objectContaining({
        label: 'Food',
        revenue: 15,
        costOfGoods: 4,
        grossMargin: 11,
      }),
    );
    expect(report.items[0].marginPercent).toBeCloseTo(73.33, 1);
  });

  it('assigns menu items to the magic menu quadrant', async () => {
    const { service } = createService({
      orders: [
        {
          _id: 'order-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          status: OrderStatus.Accepted,
          createdAt: new Date(),
          items: [
            { menuItemId: 'star', name: 'Star', quantity: 10, price: 10 },
            { menuItemId: 'plow', name: 'Plow', quantity: 10, price: 10 },
            { menuItemId: 'puzzle', name: 'Puzzle', quantity: 1, price: 10 },
            { menuItemId: 'dog', name: 'Dog', quantity: 1, price: 10 },
          ],
        },
      ],
      menuItems: ['star', 'plow', 'puzzle', 'dog'].map((id) => ({
        _id: id,
        name: id,
        category: 'Food',
        price: 10,
        isActive: true,
      })),
      recipes: [
        {
          _id: 'r-star',
          menuItemId: 'star',
          name: 'Star',
          category: 'Food',
          salePrice: 10,
          basePortions: 1,
          ingredients: [
            {
              stockItemId: 'cheap',
              stockItemName: 'Cheap',
              quantity: 1,
              unit: 'x',
            },
          ],
        },
        {
          _id: 'r-plow',
          menuItemId: 'plow',
          name: 'Plow',
          category: 'Food',
          salePrice: 10,
          basePortions: 1,
          ingredients: [
            {
              stockItemId: 'expensive',
              stockItemName: 'Expensive',
              quantity: 1,
              unit: 'x',
            },
          ],
        },
        {
          _id: 'r-puzzle',
          menuItemId: 'puzzle',
          name: 'Puzzle',
          category: 'Food',
          salePrice: 10,
          basePortions: 1,
          ingredients: [
            {
              stockItemId: 'cheap',
              stockItemName: 'Cheap',
              quantity: 1,
              unit: 'x',
            },
          ],
        },
        {
          _id: 'r-dog',
          menuItemId: 'dog',
          name: 'Dog',
          category: 'Food',
          salePrice: 10,
          basePortions: 1,
          ingredients: [
            {
              stockItemId: 'expensive',
              stockItemName: 'Expensive',
              quantity: 1,
              unit: 'x',
            },
          ],
        },
      ],
      stockItems: [
        { _id: 'cheap', locationId: 'loc-1', name: 'Cheap', averageCost: 2 },
        {
          _id: 'expensive',
          locationId: 'loc-1',
          name: 'Expensive',
          averageCost: 8,
        },
      ],
      stockMovements: [
        {
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'star',
          stockItemId: 'cheap',
          stockItemName: 'Cheap',
          quantity: 10,
          unit: 'x',
          quantityChange: -10,
          valueNet: 20,
        },
        {
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'plow',
          stockItemId: 'expensive',
          stockItemName: 'Expensive',
          quantity: 10,
          unit: 'x',
          quantityChange: -10,
          valueNet: 80,
        },
        {
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'puzzle',
          stockItemId: 'cheap',
          stockItemName: 'Cheap',
          quantity: 1,
          unit: 'x',
          quantityChange: -1,
          valueNet: 2,
        },
        {
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          type: StockMovementType.OrderConsumption,
          referenceType: 'order',
          referenceId: 'order-1',
          orderId: 'order-1',
          menuItemId: 'dog',
          stockItemId: 'expensive',
          stockItemName: 'Expensive',
          quantity: 1,
          unit: 'x',
          quantityChange: -1,
          valueNet: 8,
        },
      ],
    });

    const report = await service.getMargins(user, { range: 'today' });

    expect(
      report.quadrant.groups.stars.map((item) => item.menuItemId),
    ).toContain('star');
    expect(
      report.quadrant.groups.plowhorses.map((item) => item.menuItemId),
    ).toContain('plow');
    expect(
      report.quadrant.groups.puzzles.map((item) => item.menuItemId),
    ).toContain('puzzle');
    expect(
      report.quadrant.groups.dogs.map((item) => item.menuItemId),
    ).toContain('dog');
  });

  it('queries stock movements by tenant, readable location and order references', async () => {
    const { service, stockMovementModel } = createService({
      orders: [
        {
          _id: 'order-tenant-safe',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          status: OrderStatus.Accepted,
          createdAt: new Date(),
          items: [
            {
              menuItemId: 'menu-1',
              name: 'Cheeseburger',
              quantity: 1,
              price: 12.9,
            },
          ],
        },
      ],
      menuItems: [
        {
          _id: 'menu-1',
          name: 'Cheeseburger',
          category: 'Burger',
          price: 12.9,
          isActive: true,
        },
      ],
    });

    await service.getMargins(user, { range: 'today' });

    expect(stockMovementModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: { $in: ['loc-1'] },
        type: {
          $in: expect.arrayContaining([
            StockMovementType.OrderConsumption,
            StockMovementType.OrderQuantityAdjustment,
            StockMovementType.OrderCancelReversal,
          ]),
        },
        $and: expect.arrayContaining([
          expect.objectContaining({
            $or: expect.arrayContaining([{ tenantId: 'tenant-1' }]),
          }),
          expect.objectContaining({
            $or: expect.arrayContaining([
              {
                referenceType: 'order',
                referenceId: { $in: ['order-tenant-safe'] },
              },
              { orderId: { $in: ['order-tenant-safe'] } },
            ]),
          }),
        ]),
      }),
    );
  });

  it('rejects roles without margin report permission scope', async () => {
    const { service } = createService({});

    await expect(
      service.getMargins(
        { ...user, roles: [Role.Service] },
        { range: 'today' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows inventory managers with report permission to view COGS', async () => {
    const { service } = createService({});

    await expect(
      service.getMargins(
        { ...user, roles: [Role.InventoryManager], permissions: ['reports.view'] },
        { range: 'today' },
      ),
    ).resolves.toEqual(expect.objectContaining({ summary: expect.any(Object) }));
  });

  it('blocks platform admins from operative margin reports', async () => {
    const { service } = createService({});

    await expect(
      service.getMargins(
        {
          sub: 'platform-1',
          email: 'platform@test.local',
          roles: [Role.PlatformAdminCode],
        },
        { range: 'today' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
