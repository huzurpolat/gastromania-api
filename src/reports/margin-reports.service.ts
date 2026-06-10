import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { hasAnyRole } from '../auth/role-utils';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Location } from '../locations/schemas/location.schema';
import { MenuItem } from '../menu-items/schemas/menu-item.schema';
import { Order, OrderStatus } from '../orders/schemas/order.schema';
import { Recipe } from '../recipes/schemas/recipe.schema';
import { StockItem } from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementType,
} from '../stock/schemas/stock-movement.schema';
import { MarginReportQueryDto } from './dto/margin-report-query.dto';
import { MarginAnalysisRun } from './schemas/margin-analysis-run.schema';

type CostBasis =
  | 'stockMovementValueNet'
  | 'averageCost'
  | 'unitCost'
  | 'lastPurchasePrice'
  | 'purchasePriceNet'
  | 'recipePurchasePriceNet'
  | 'missing';
type MarginStatus =
  | 'healthy'
  | 'below_target'
  | 'negative_margin'
  | 'high_food_cost'
  | 'missing_recipe';
type Quadrant = 'stars' | 'plowhorses' | 'puzzles' | 'dogs';
type MarginReportWarningType =
  | 'missing_cost'
  | 'missing_recipe'
  | 'missing_stock_movement_cost'
  | 'incomplete_data'
  | 'negative_margin'
  | 'below_target';
type MarginReportGroupBy = 'total' | 'location' | 'category' | 'menuItem';

interface Period {
  range: string;
  from: Date;
  to: Date;
}

interface ResolvedScope {
  tenantId: string;
  period: Period;
  locationIds: string[];
  locations: Array<Location & { _id: unknown }>;
  companyId?: string;
  regionId?: string;
  locationId?: string;
  category?: string;
  menuItemId?: string;
}

interface SalesStat {
  menuItemId?: string;
  key: string;
  name: string;
  category?: string;
  locationId: string;
  quantity: number;
  revenue: number;
  orderCount: number;
}

interface IngredientCostLine {
  stockItemId: string;
  stockItemName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  basis: CostBasis;
}

interface MovementCostSummary {
  costOfGoods: number;
  costBasis: CostBasis[];
  warnings: string[];
  ingredientCosts: IngredientCostLine[];
}

export interface MenuItemMarginReportRow {
  menuItemId?: string;
  recipeId?: string;
  name: string;
  category: string;
  locationIds: string[];
  soldQuantity: number;
  orderCount: number;
  sellingPrice: number;
  revenue: number;
  recipeCost: number;
  costOfGoods: number;
  contributionMargin: number;
  contributionMarginTotal: number;
  marginPercent: number;
  foodCostPercent: number;
  targetMargin: number;
  status: MarginStatus;
  quadrant: Quadrant;
  costBasis: CostBasis[];
  warnings: string[];
  ingredientCosts: IngredientCostLine[];
}

export interface LocationMarginReportRow {
  locationId: string;
  locationName: string;
  city?: string;
  revenue: number;
  costOfGoods: number;
  contributionMargin: number;
  averageMarginPercent: number;
  soldQuantity: number;
  orderCount: number;
  belowTargetItems: number;
  topItems: MenuItemMarginReportRow[];
  worstItems: MenuItemMarginReportRow[];
}

export interface MarginReportItem {
  key: string;
  label: string;
  groupBy: MarginReportGroupBy;
  revenue: number;
  costOfGoods: number;
  grossMargin: number;
  marginPercent: number;
  warningCount: number;
  warnings: string[];
}

export interface MarginReportWarning {
  type: MarginReportWarningType;
  message: string;
  menuItemId?: string;
  stockItemId?: string;
  orderId?: string;
}

@Injectable()
export class MarginReportsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(MenuItem.name) private readonly menuItemModel: Model<MenuItem>,
    @InjectModel(Recipe.name) private readonly recipeModel: Model<Recipe>,
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItem>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovement>,
    @InjectModel(Location.name) private readonly locationModel: Model<Location>,
    @InjectModel(MarginAnalysisRun.name)
    private readonly analysisRunModel: Model<MarginAnalysisRun>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async getMargins(user: AuthenticatedUser, query: MarginReportQueryDto) {
    this.assertCanViewMargins(user);

    const scope = await this.resolveScope(user, query);
    const rows = await this.buildMenuItemRows(scope);
    const summary = this.createSummary(rows);
    const locations = this.createLocationRows(rows, scope.locations);
    const quadrant = this.createQuadrant(rows);
    const warnings = this.unique(rows.flatMap((row) => row.warnings));
    const warningDetails = this.createWarningDetails(rows);
    const groupBy = query.groupBy ?? 'menuItem';
    const items = this.createReportItems(rows, locations, groupBy);
    const run = await this.analysisRunModel.create({
      actorId: user.sub,
      companyId: scope.companyId,
      regionId: scope.regionId,
      locationId: scope.locationId,
      range: scope.period.range,
      from: scope.period.from,
      to: scope.period.to,
      costBasis: 'StockMovement.valueNet',
      warningsCount: warnings.length,
      warnings,
    });

    return {
      generatedAt: new Date().toISOString(),
      analysisRunId: String(run._id),
      period: {
        range: scope.period.range,
        from: scope.period.from.toISOString(),
        to: scope.period.to.toISOString(),
      },
      costBasis: 'StockMovement.valueNet',
      filters: {
        companyId: scope.companyId,
        regionId: scope.regionId,
        locationId: scope.locationId,
        category: scope.category,
        menuItemId: scope.menuItemId,
        groupBy,
      },
      summary,
      items,
      menuItems: rows,
      locations,
      quadrant,
      warnings,
      warningDetails,
    };
  }

  async getMenuItems(user: AuthenticatedUser, query: MarginReportQueryDto) {
    return (await this.getMargins(user, query)).menuItems;
  }

  async getLocations(user: AuthenticatedUser, query: MarginReportQueryDto) {
    return (await this.getMargins(user, query)).locations;
  }

  async getQuadrant(user: AuthenticatedUser, query: MarginReportQueryDto) {
    return (await this.getMargins(user, query)).quadrant;
  }

  async getSummary(user: AuthenticatedUser, query: MarginReportQueryDto) {
    return (await this.getMargins(user, query)).summary;
  }

  private async buildMenuItemRows(
    scope: ResolvedScope,
  ): Promise<MenuItemMarginReportRow[]> {
    const orderFilter = {
      tenantId: scope.tenantId,
      locationId: { $in: scope.locationIds },
      status: { $in: this.marginRelevantStatuses() },
      createdAt: { $gte: scope.period.from, $lte: scope.period.to },
    };
    const [orders, menuItems, recipes, stockItems] = await Promise.all([
      this.orderModel.find(orderFilter).lean(),
      this.menuItemModel
        .find({
          ...(scope.category ? { category: scope.category } : {}),
          ...(scope.menuItemId ? { _id: scope.menuItemId } : {}),
          isActive: { $ne: false },
        })
        .lean(),
      this.recipeModel
        .find({
          isArchived: { $ne: true },
          ...(scope.locationIds.length
            ? {
                $or: [
                  { locationId: { $exists: false } },
                  { locationId: '' },
                  { locationId: { $in: scope.locationIds } },
                ],
              }
            : {}),
        })
        .lean(),
      this.stockItemModel
        .find({ locationId: { $in: scope.locationIds } })
        .lean(),
    ]);
    const orderIds = (orders as Array<Order & { _id: unknown }>)
      .map((order) => this.stringifyId(order._id))
      .filter(Boolean);
    const movements = orderIds.length
      ? await this.stockMovementModel
          .find({
            locationId: { $in: scope.locationIds },
            type: { $in: this.cogsMovementTypes() },
            $and: [
              {
                $or: [
                  { tenantId: scope.tenantId },
                  { tenantId: { $exists: false } },
                  { tenantId: '' },
                  { tenantId: null },
                ],
              },
              {
                $or: [
                  { referenceType: 'order', referenceId: { $in: orderIds } },
                  { orderId: { $in: orderIds } },
                ],
              },
            ],
          })
          .lean()
      : [];
    const menuById = new Map(
      menuItems.map((item) => [this.stringifyId(item._id), item]),
    );
    const menuByName = new Map(
      menuItems.map((item) => [this.normalize(item.name), item]),
    );
    const recipesByMenuId = new Map<string, Recipe & { _id: unknown }>();
    const recipesById = new Map<string, Recipe & { _id: unknown }>();
    const recipesByName = new Map<string, Recipe & { _id: unknown }>();
    const stockById = new Map(
      stockItems.map((item) => [this.stringifyId(item._id), item]),
    );
    const sales = new Map<string, SalesStat>();
    const orderItemSalesKeys = new Map<string, string>();
    const orderSalesKeys = new Map<string, Set<string>>();
    const recipeSalesKeys = new Map<string, string>();

    for (const recipe of recipes as Array<Recipe & { _id: unknown }>) {
      const recipeId = this.stringifyId(recipe._id);
      recipesById.set(recipeId, recipe);
      if (recipe.menuItemId) {
        recipesByMenuId.set(recipe.menuItemId, recipe);
      }
      recipesByName.set(this.normalize(recipe.name), recipe);
    }

    for (const order of orders as Array<Order & { _id: unknown }>) {
      const orderId = this.stringifyId(order._id);
      for (const item of order.items ?? []) {
        const itemId = item.menuItemId || item.productId;
        if (scope.menuItemId && itemId !== scope.menuItemId) {
          continue;
        }
        const menuItem = itemId
          ? menuById.get(itemId)
          : menuByName.get(this.normalize(item.name));
        const category =
          menuItem?.category ?? item.courseType ?? 'Ohne Kategorie';
        if (scope.category && category !== scope.category) {
          continue;
        }
        const key = itemId ?? this.normalize(item.name);
        const current =
          sales.get(key) ??
          ({
            key,
            menuItemId: itemId,
            name: menuItem?.name ?? item.name,
            category,
            locationId: order.locationId,
            quantity: 0,
            revenue: 0,
            orderCount: 0,
          } satisfies SalesStat);

        current.quantity += item.quantity;
        current.revenue += item.quantity * item.price;
        current.orderCount += 1;
        sales.set(key, current);
        if (orderId) {
          const keys = orderSalesKeys.get(orderId) ?? new Set<string>();
          keys.add(key);
          orderSalesKeys.set(orderId, keys);
          const orderItemId = this.stringifyId(item._id);
          if (orderItemId) {
            orderItemSalesKeys.set(`${orderId}:${orderItemId}`, key);
          }
        }
      }
    }

    for (const recipe of recipes as Array<Recipe & { _id: unknown }>) {
      const recipeId = this.stringifyId(recipe._id);
      const key =
        (recipe.menuItemId && sales.has(recipe.menuItemId)
          ? recipe.menuItemId
          : undefined) ?? this.normalize(recipe.name);
      if (recipeId) {
        recipeSalesKeys.set(recipeId, key);
      }
    }

    const movementCosts = this.summarizeMovementCosts(
      movements as Array<StockMovement & { _id: unknown }>,
      orderItemSalesKeys,
      orderSalesKeys,
      recipeSalesKeys,
    );

    const keys = new Set([
      ...sales.keys(),
      ...menuItems.map((item) => this.stringifyId(item._id)),
    ]);

    const baseRows = Array.from(keys).map((key) => {
      const stat = sales.get(key);
      const menuItem =
        menuById.get(key) ??
        (stat ? menuByName.get(this.normalize(stat.name)) : undefined);
      const rowKey =
        stat?.menuItemId ?? (menuItem ? this.stringifyId(menuItem._id) : key);
      const locationIds = this.unique(
        Array.from(sales.values())
          .filter((entry) => entry.key === key || entry.menuItemId === rowKey)
          .map((entry) => entry.locationId),
      );
      const recipe =
        (menuItem?.recipeId ? recipesById.get(menuItem.recipeId) : undefined) ??
        (rowKey ? recipesByMenuId.get(rowKey) : undefined) ??
        recipesByName.get(this.normalize(menuItem?.name ?? stat?.name ?? key));
      const cost = this.calculateRecipeCost(recipe, stockById);
      const actualCost = movementCosts.get(rowKey) ?? movementCosts.get(key);
      const sellingPrice = Number(
        menuItem?.sellingPrice ??
          menuItem?.price ??
          recipe?.salePrice ??
          (stat?.revenue && stat.quantity ? stat.revenue / stat.quantity : 0),
      );
      const soldQuantity = Number(stat?.quantity ?? 0);
      const revenue = Number(stat?.revenue ?? 0);
      const costOfGoods = actualCost?.costOfGoods ?? 0;
      const recipeCost =
        soldQuantity > 0 ? costOfGoods / soldQuantity : cost.costPerPortion;
      const contributionMargin = sellingPrice - recipeCost;
      const contributionMarginTotal = revenue - costOfGoods;
      const marginPercent =
        revenue > 0 ? (contributionMarginTotal / revenue) * 100 : 0;
      const foodCostPercent = revenue > 0 ? (costOfGoods / revenue) * 100 : 0;
      const targetMargin = Number(menuItem?.targetMargin ?? 65);
      const warnings = [
        ...(actualCost?.warnings ?? []),
        ...cost.warnings,
        ...(soldQuantity > 0 && !actualCost
          ? [
              `${menuItem?.name ?? stat?.name ?? key}: keine StockMovements für COGS gefunden`,
            ]
          : []),
        ...(!recipe
          ? [`${menuItem?.name ?? stat?.name ?? key}: kein Rezept hinterlegt`]
          : []),
        ...(sellingPrice <= 0
          ? [`${menuItem?.name ?? stat?.name ?? key}: Verkaufspreis fehlt`]
          : []),
        ...(marginPercent < 0
          ? [`${menuItem?.name ?? stat?.name ?? key}: negative Marge`]
          : []),
        ...(marginPercent > 0 && marginPercent < targetMargin
          ? [
              `${menuItem?.name ?? stat?.name ?? key}: Marge unter Zielmarge ${targetMargin}%`,
            ]
          : []),
      ];

      return {
        menuItemId: menuItem
          ? this.stringifyId(menuItem._id)
          : stat?.menuItemId,
        recipeId: recipe ? this.stringifyId(recipe._id) : undefined,
        name: menuItem?.name ?? stat?.name ?? key,
        category:
          menuItem?.category ??
          stat?.category ??
          recipe?.category ??
          'Ohne Kategorie',
        locationIds,
        soldQuantity,
        orderCount: Number(stat?.orderCount ?? 0),
        sellingPrice,
        revenue,
        recipeCost,
        costOfGoods,
        contributionMargin,
        contributionMarginTotal,
        marginPercent,
        foodCostPercent,
        targetMargin,
        status: this.resolveStatus(
          Boolean(recipe),
          marginPercent,
          foodCostPercent,
          targetMargin,
        ),
        quadrant: 'dogs' as Quadrant,
        costBasis: actualCost?.costBasis ?? ['missing'],
        warnings: this.unique(warnings),
        ingredientCosts: actualCost?.ingredientCosts ?? [],
      };
    });

    const quantityThreshold = this.average(
      baseRows.map((row) => row.soldQuantity),
    );
    const marginThreshold = this.average(
      baseRows.map((row) => row.marginPercent).filter((value) => value > 0),
    );

    return baseRows
      .map((row) => ({
        ...row,
        quadrant: this.resolveQuadrant(row, quantityThreshold, marginThreshold),
      }))
      .sort(
        (first, second) =>
          second.revenue - first.revenue ||
          second.soldQuantity - first.soldQuantity,
      );
  }

  private calculateRecipeCost(
    recipe: (Recipe & { _id: unknown }) | undefined,
    stockById: Map<string, StockItem>,
  ) {
    if (!recipe) {
      return {
        costPerPortion: 0,
        costBasis: ['missing'] as CostBasis[],
        warnings: [] as string[],
        ingredients: [] as IngredientCostLine[],
      };
    }

    const warnings: string[] = [];
    const costBasis = new Set<CostBasis>();
    const ingredients = (recipe.ingredients ?? []).map((ingredient) => {
      const stockItem = stockById.get(ingredient.stockItemId);
      if (!stockItem) {
        warnings.push(
          `${recipe.name}: Lagerartikel ${ingredient.stockItemName} fehlt`,
        );
      }
      const cost = this.resolveIngredientUnitCost(
        ingredient.purchasePriceNet,
        stockItem,
      );
      costBasis.add(cost.basis);
      if (cost.value <= 0) {
        warnings.push(
          `${recipe.name}: Einkaufspreis für ${ingredient.stockItemName} fehlt`,
        );
      }
      const quantity = ingredient.quantity * (ingredient.wasteFactor ?? 1);
      const totalCost = quantity * cost.value;

      return {
        stockItemId: ingredient.stockItemId,
        stockItemName: ingredient.stockItemName,
        quantity,
        unit: ingredient.unit,
        costPerUnit: cost.value,
        totalCost,
        basis: cost.basis,
      };
    });
    const total = ingredients.reduce((sum, item) => sum + item.totalCost, 0);
    const portions = recipe.basePortions || 1;

    return {
      costPerPortion: total / portions,
      costBasis: Array.from(costBasis),
      warnings,
      ingredients,
    };
  }

  private summarizeMovementCosts(
    movements: Array<StockMovement & { _id: unknown }>,
    orderItemSalesKeys: Map<string, string>,
    orderSalesKeys: Map<string, Set<string>>,
    recipeSalesKeys: Map<string, string>,
  ): Map<string, MovementCostSummary> {
    const summaries = new Map<string, MovementCostSummary>();

    for (const movement of movements) {
      const orderId = this.stringifyId(movement.referenceId ?? movement.orderId);
      const key =
        movement.menuItemId ??
        (movement.orderItemId
          ? orderItemSalesKeys.get(`${orderId}:${movement.orderItemId}`)
          : undefined) ??
        (movement.recipeId ? recipeSalesKeys.get(movement.recipeId) : undefined) ??
        this.singleOrderSalesKey(orderSalesKeys.get(orderId));

      if (!key) {
        continue;
      }

      const valueNet = Number(movement.valueNet ?? 0);
      const signedValue = this.signedMovementValue(movement);
      const summary =
        summaries.get(key) ??
        ({
          costOfGoods: 0,
          costBasis: ['stockMovementValueNet'],
          warnings: [],
          ingredientCosts: [],
        } satisfies MovementCostSummary);

      summary.costOfGoods += signedValue;
      if (valueNet <= 0) {
        summary.warnings.push(
          `${movement.stockItemName}: Missing stock cost`,
        );
      }
      summary.ingredientCosts.push({
        stockItemId: movement.stockItemId,
        stockItemName: movement.stockItemName,
        quantity: Number(movement.quantity ?? Math.abs(movement.quantityChange)),
        unit: movement.unit ?? '',
        costPerUnit:
          Number(movement.quantity ?? 0) > 0
            ? valueNet / Number(movement.quantity)
            : 0,
        totalCost: signedValue,
        basis: 'stockMovementValueNet',
      });
      summaries.set(key, summary);
    }

    return summaries;
  }

  private signedMovementValue(movement: StockMovement): number {
    const value = Math.abs(Number(movement.valueNet ?? 0));

    if (movement.type === StockMovementType.OrderCancelReversal) {
      return -value;
    }
    if (
      movement.type === StockMovementType.OrderQuantityAdjustment &&
      Number(movement.quantityChange ?? 0) > 0
    ) {
      return -value;
    }

    return value;
  }

  private singleOrderSalesKey(keys: Set<string> | undefined): string | undefined {
    if (!keys || keys.size !== 1) {
      return undefined;
    }

    return [...keys][0];
  }

  private resolveIngredientUnitCost(
    recipePurchasePriceNet: number | undefined,
    stockItem?: StockItem,
  ): { value: number; basis: CostBasis } {
    const candidates: Array<{ value?: number; basis: CostBasis }> = [
      { value: stockItem?.averageCost, basis: 'averageCost' },
      { value: stockItem?.unitCost, basis: 'unitCost' },
      { value: stockItem?.lastPurchasePrice, basis: 'lastPurchasePrice' },
      { value: stockItem?.purchasePriceNet, basis: 'purchasePriceNet' },
      { value: recipePurchasePriceNet, basis: 'recipePurchasePriceNet' },
    ];
    const match = candidates.find(
      (candidate) => Number(candidate.value ?? 0) > 0,
    );

    return match
      ? { value: Number(match.value), basis: match.basis }
      : { value: 0, basis: 'missing' };
  }

  private createSummary(rows: MenuItemMarginReportRow[]) {
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const costOfGoods = rows.reduce((sum, row) => sum + row.costOfGoods, 0);
    const contributionMargin = revenue - costOfGoods;

    return {
      revenue,
      costOfGoods,
      contributionMargin,
      grossMargin: contributionMargin,
      averageMarginPercent:
        revenue > 0 ? (contributionMargin / revenue) * 100 : 0,
      marginPercent:
        revenue > 0 ? (contributionMargin / revenue) * 100 : 0,
      soldQuantity: rows.reduce((sum, row) => sum + row.soldQuantity, 0),
      orderCount: rows.reduce((sum, row) => sum + row.orderCount, 0),
      belowTargetItems: rows.filter((row) => row.status === 'below_target')
        .length,
      negativeMarginItems: rows.filter(
        (row) => row.status === 'negative_margin',
      ).length,
      highFoodCostItems: rows.filter((row) => row.status === 'high_food_cost')
        .length,
      itemsWithoutRecipe: rows.filter((row) => row.status === 'missing_recipe')
        .length,
      itemsWithoutSales: rows.filter((row) => row.soldQuantity === 0).length,
      warningsCount: this.unique(rows.flatMap((row) => row.warnings)).length,
      warningCount: this.unique(rows.flatMap((row) => row.warnings)).length,
      topSeller: [...rows]
        .sort((first, second) => second.soldQuantity - first.soldQuantity)
        .slice(0, 10),
      lowMarginItems: [...rows]
        .sort((first, second) => first.marginPercent - second.marginPercent)
        .slice(0, 10),
      highMarginLowSalesItems: rows
        .filter((row) => row.marginPercent >= 65)
        .sort(
          (first, second) =>
            first.soldQuantity - second.soldQuantity ||
            second.marginPercent - first.marginPercent,
        )
        .slice(0, 10),
    };
  }

  private createReportItems(
    rows: MenuItemMarginReportRow[],
    locations: LocationMarginReportRow[],
    groupBy: MarginReportGroupBy,
  ): MarginReportItem[] {
    if (groupBy === 'total') {
      return [this.aggregateReportItem('total', 'Gesamt', groupBy, rows)];
    }

    if (groupBy === 'location') {
      return locations
        .map((location) => {
          const locationRows = rows.filter(
            (row) =>
              !row.locationIds.length ||
              row.locationIds.includes(location.locationId),
          );

          return this.aggregateReportItem(
            location.locationId,
            location.locationName,
            groupBy,
            locationRows,
          );
        })
        .sort((first, second) => second.revenue - first.revenue);
    }

    if (groupBy === 'category') {
      const groupedRows = new Map<string, MenuItemMarginReportRow[]>();

      for (const row of rows) {
        groupedRows.set(row.category, [
          ...(groupedRows.get(row.category) ?? []),
          row,
        ]);
      }

      return [...groupedRows.entries()]
        .map(([category, categoryRows]) =>
          this.aggregateReportItem(category, category, groupBy, categoryRows),
        )
        .sort((first, second) => second.revenue - first.revenue);
    }

    return rows.map((row) => ({
      key: row.menuItemId ?? row.name,
      label: row.name,
      groupBy,
      revenue: row.revenue,
      costOfGoods: row.costOfGoods,
      grossMargin: row.contributionMarginTotal,
      marginPercent: row.marginPercent,
      warningCount: row.warnings.length,
      warnings: row.warnings,
    }));
  }

  private aggregateReportItem(
    key: string,
    label: string,
    groupBy: MarginReportGroupBy,
    rows: MenuItemMarginReportRow[],
  ): MarginReportItem {
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const costOfGoods = rows.reduce((sum, row) => sum + row.costOfGoods, 0);
    const grossMargin = revenue - costOfGoods;
    const warnings = this.unique(rows.flatMap((row) => row.warnings));

    return {
      key,
      label,
      groupBy,
      revenue,
      costOfGoods,
      grossMargin,
      marginPercent: revenue > 0 ? (grossMargin / revenue) * 100 : 0,
      warningCount: warnings.length,
      warnings,
    };
  }

  private createWarningDetails(
    rows: MenuItemMarginReportRow[],
  ): MarginReportWarning[] {
    return rows.flatMap((row) =>
      row.warnings.map((warning) => ({
        type: this.classifyWarning(warning),
        message: warning,
        menuItemId: row.menuItemId,
      })),
    );
  }

  private classifyWarning(warning: string): MarginReportWarningType {
    const normalizedWarning = warning.toLocaleLowerCase('de-DE');

    if (normalizedWarning.includes('kein rezept')) {
      return 'missing_recipe';
    }
    if (
      normalizedWarning.includes('missing stock cost') ||
      normalizedWarning.includes('stockmovement')
    ) {
      return 'missing_stock_movement_cost';
    }
    if (
      normalizedWarning.includes('einkaufspreis') ||
      normalizedWarning.includes('verkaufspreis')
    ) {
      return 'missing_cost';
    }
    if (normalizedWarning.includes('negative marge')) {
      return 'negative_margin';
    }
    if (normalizedWarning.includes('zielmarge')) {
      return 'below_target';
    }

    return 'incomplete_data';
  }

  private createLocationRows(
    rows: MenuItemMarginReportRow[],
    locations: Array<Location & { _id: unknown }>,
  ): LocationMarginReportRow[] {
    return locations.map((location) => {
      const locationId = this.stringifyId(location._id);
      const locationRows = rows.filter(
        (row) =>
          !row.locationIds.length || row.locationIds.includes(locationId),
      );
      const revenue = locationRows.reduce((sum, row) => sum + row.revenue, 0);
      const costOfGoods = locationRows.reduce(
        (sum, row) => sum + row.costOfGoods,
        0,
      );
      const contributionMargin = revenue - costOfGoods;

      return {
        locationId,
        locationName: location.name,
        city: location.city,
        revenue,
        costOfGoods,
        contributionMargin,
        averageMarginPercent:
          revenue > 0 ? (contributionMargin / revenue) * 100 : 0,
        soldQuantity: locationRows.reduce(
          (sum, row) => sum + row.soldQuantity,
          0,
        ),
        orderCount: locationRows.reduce((sum, row) => sum + row.orderCount, 0),
        belowTargetItems: locationRows.filter(
          (row) => row.status === 'below_target',
        ).length,
        topItems: [...locationRows]
          .sort((first, second) => second.revenue - first.revenue)
          .slice(0, 10),
        worstItems: [...locationRows]
          .sort((first, second) => first.marginPercent - second.marginPercent)
          .slice(0, 10),
      };
    });
  }

  private createQuadrant(rows: MenuItemMarginReportRow[]) {
    const groups: Record<Quadrant, MenuItemMarginReportRow[]> = {
      stars: [],
      plowhorses: [],
      puzzles: [],
      dogs: [],
    };

    for (const row of rows) {
      groups[row.quadrant].push(row);
    }

    return {
      axes: {
        x: 'Verkaufsmenge / Popularität',
        y: 'Marge / Profitabilität',
      },
      thresholds: {
        quantity: this.average(rows.map((row) => row.soldQuantity)),
        marginPercent: this.average(
          rows.map((row) => row.marginPercent).filter((value) => value > 0),
        ),
      },
      groups,
    };
  }

  private async resolveScope(
    user: AuthenticatedUser,
    query: MarginReportQueryDto,
  ): Promise<ResolvedScope> {
    const period = this.resolvePeriod(query);
    if (
      hasAnyRole(user.roles, [
        Role.PlatformAdminCode,
        Role.PlatformAdmin,
        Role.SuperAdmin,
      ])
    ) {
      throw new ForbiddenException(
        'Platform Admin darf keine operativen Margenreports nutzen',
      );
    }
    if (!user.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext für Margenreports');
    }
    if (
      query.companyId &&
      !this.accessPolicy.canAccessCompany(user, query.companyId)
    ) {
      throw new ForbiddenException(
        'Keine Berechtigung für dieses Unternehmen',
      );
    }
    if (
      query.regionId &&
      !(await this.accessPolicy.canAccessRegion(user, query.regionId))
    ) {
      throw new ForbiddenException('Keine Berechtigung für diese Region');
    }
    if (query.locationId) {
      await this.accessPolicy.assertCanAccessLocation(user, query.locationId);
    }

    const readableLocationIds =
      await this.accessPolicy.getReadableLocationIds(user);
    const locationFilter: Record<string, unknown> = {
      tenantId: user.tenantId,
      _id: { $in: query.locationId ? [query.locationId] : readableLocationIds },
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.regionId ? { regionId: query.regionId } : {}),
      isActive: { $ne: false },
    };
    const locations = await this.locationModel.find(locationFilter).lean();

    return {
      period,
      tenantId: user.tenantId,
      locationIds: locations.map((location) => this.stringifyId(location._id)),
      locations: locations as Array<Location & { _id: unknown }>,
      companyId: query.companyId,
      regionId: query.regionId,
      locationId: query.locationId,
      category: query.category,
      menuItemId: query.menuItemId,
    };
  }

  private resolvePeriod(query: MarginReportQueryDto): Period {
    if (query.from && query.to) {
      return {
        range: query.range ?? 'custom',
        from: new Date(query.from),
        to: this.endOfDay(new Date(query.to)),
      };
    }

    if (query.dateFrom && query.dateTo) {
      return {
        range: query.range ?? 'custom',
        from: new Date(query.dateFrom),
        to: this.endOfDay(new Date(query.dateTo)),
      };
    }

    const now = new Date();
    const range = query.range ?? 'today';

    if (range === 'yesterday') {
      const yesterday = this.addDays(now, -1);
      return {
        range,
        from: this.startOfDay(yesterday),
        to: this.endOfDay(yesterday),
      };
    }

    if (range === 'week') {
      return { range, from: this.startOfWeek(now), to: this.endOfDay(now) };
    }

    if (range === 'month') {
      return {
        range,
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: this.endOfDay(now),
      };
    }

    return {
      range: 'today',
      from: this.startOfDay(now),
      to: this.endOfDay(now),
    };
  }

  private resolveStatus(
    hasRecipe: boolean,
    marginPercent: number,
    foodCostPercent: number,
    targetMargin: number,
  ): MarginStatus {
    if (!hasRecipe) {
      return 'missing_recipe';
    }
    if (marginPercent < 0) {
      return 'negative_margin';
    }
    if (marginPercent < targetMargin) {
      return 'below_target';
    }
    if (foodCostPercent >= 40) {
      return 'high_food_cost';
    }

    return 'healthy';
  }

  private resolveQuadrant(
    row: MenuItemMarginReportRow,
    quantityThreshold: number,
    marginThreshold: number,
  ): Quadrant {
    const highSales = row.soldQuantity >= quantityThreshold;
    const highMargin = row.marginPercent >= marginThreshold;

    if (highSales && highMargin) {
      return 'stars';
    }
    if (highSales && !highMargin) {
      return 'plowhorses';
    }
    if (!highSales && highMargin) {
      return 'puzzles';
    }

    return 'dogs';
  }

  private marginRelevantStatuses(): OrderStatus[] {
    return [
      OrderStatus.Accepted,
      OrderStatus.Preparing,
      OrderStatus.Ready,
      OrderStatus.Served,
      OrderStatus.Closed,
    ];
  }

  private cogsMovementTypes(): StockMovementType[] {
    return [
      StockMovementType.OrderConsumption,
      StockMovementType.OrderQuantityAdjustment,
      StockMovementType.OrderCancelReversal,
    ];
  }

  private assertCanViewMargins(user: AuthenticatedUser): void {
    if (
      !hasAnyRole(user.roles, [
        Role.TenantAdminCode,
        Role.TenantAdmin,
        Role.CompanyAdmin,
        Role.RegionAdmin,
        Role.Admin,
        Role.Regionalleiter,
        Role.Bereichsleiter,
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
        Role.InventoryManager,
        Role.Lager,
        Role.Einkauf,
        Role.Buchhaltung,
      ])
    ) {
      throw new ForbiddenException('Keine Berechtigung für Margenreports');
    }
  }

  private startOfDay(date: Date): Date {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
  }

  private endOfDay(date: Date): Date {
    const value = new Date(date);
    value.setHours(23, 59, 59, 999);
    return value;
  }

  private startOfWeek(date: Date): Date {
    const value = this.startOfDay(date);
    const day = value.getDay() || 7;
    value.setDate(value.getDate() - day + 1);
    return value;
  }

  private addDays(date: Date, days: number): Date {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return value;
  }

  private average(values: number[]): number {
    const cleanValues = values.filter((value) => Number.isFinite(value));
    if (!cleanValues.length) {
      return 0;
    }

    return (
      cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length
    );
  }

  private normalize(value: string): string {
    return value.trim().toLocaleLowerCase('de-DE');
  }

  private stringifyId(value: unknown): string {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Types.ObjectId) {
      return value.toHexString();
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      value.toString !== Object.prototype.toString
    ) {
      return (value as { toString: () => string }).toString();
    }

    return '';
  }

  private unique(values: Array<string | undefined>): string[] {
    return [
      ...new Set(values.filter((value): value is string => Boolean(value))),
    ];
  }
}
