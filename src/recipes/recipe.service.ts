import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  MenuItem,
  MenuItemDocument,
} from '../menu-items/schemas/menu-item.schema';
import {
  StockItem,
  StockItemDocument,
} from '../stock/schemas/stock-item.schema';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipe.dto';
import { RecipeCalculationService } from './recipe-calculation.service';
import { RecipeInventoryService } from './recipe-inventory.service';
import {
  Recipe,
  RecipeDocument,
  RecipeIngredient,
} from './schemas/recipe.schema';

type RecipeWarningType =
  | 'missing_cost'
  | 'missing_price'
  | 'unknown_unit'
  | 'duplicate_stock_item'
  | 'missing_stock_item';

export interface RecipeWarning {
  type: RecipeWarningType;
  message: string;
  stockItemId?: string;
  stockItemName?: string;
}

export interface RecipeIngredientResponse {
  id?: string;
  stockItemId: string;
  stockItemName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  purchasePriceNet: number;
  warnings: RecipeWarning[];
}

export interface RecipeResponse {
  _id: string;
  id: string;
  companyId?: string;
  tenantId?: string;
  locationId?: string;
  recipeNumber: string;
  menuItemId?: string;
  menuItemName?: string;
  menuItemPrice: number;
  name: string;
  description?: string;
  category: string;
  imageUrl?: string;
  type: string;
  salePrice: number;
  vatRate: number;
  isActive: boolean;
  visibleInSales: boolean;
  productionArea: string;
  preparationTimeMinutes: number;
  portionSize: string;
  basePortions: number;
  isArchived: boolean;
  ingredients: RecipeIngredientResponse[];
  manualAllergens: string[];
  manualAdditives: string[];
  steps: unknown[];
  costing: ReturnType<RecipeCalculationService['calculate']>;
  recipeCost: number;
  expectedMargin: number;
  expectedMarginPercent: number;
  warnings: RecipeWarning[];
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class RecipeService {
  constructor(
    @InjectModel(Recipe.name)
    private readonly recipeModel: Model<RecipeDocument>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItemDocument>,
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItemDocument>,
    private readonly calculationService: RecipeCalculationService,
    private readonly inventoryService: RecipeInventoryService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async findAll(
    _actor: AuthenticatedUser,
    filters: {
      q?: string;
      category?: string;
      productionArea?: string;
      active?: string;
    },
  ) {
    const query: Record<string, unknown> = { isArchived: { $ne: true } };
    if (filters.q) {
      query.$or = [
        { name: new RegExp(filters.q, 'i') },
        { recipeNumber: new RegExp(filters.q, 'i') },
      ];
    }
    if (filters.category) query.category = filters.category;
    if (filters.productionArea) query.productionArea = filters.productionArea;
    if (filters.active !== undefined)
      query.isActive = filters.active === 'true';
    const recipes = await this.recipeModel.find(query).sort({ name: 1 }).exec();
    const scopedRecipes = await this.filterReadableRecipes(recipes, _actor);
    return Promise.all(
      scopedRecipes.map((recipe) => this.toRecipeResponse(recipe, _actor)),
    );
  }

  async findOne(
    id: string,
    actor?: AuthenticatedUser,
  ): Promise<RecipeDocument> {
    const recipe = await this.recipeModel.findById(id).exec();
    if (!recipe || (actor && !(await this.canReadRecipe(recipe, actor)))) {
      throw new NotFoundException('Rezept nicht gefunden');
    }
    return recipe;
  }

  async findOneResponse(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<RecipeResponse> {
    return this.toRecipeResponse(await this.findOne(id, actor), actor);
  }

  async findByMenuItem(
    menuItemId: string,
    actor: AuthenticatedUser,
  ): Promise<RecipeResponse> {
    await this.assertMenuItemReadable(menuItemId, actor);
    const recipe = await this.recipeModel
      .findOne({ menuItemId, isArchived: { $ne: true } })
      .exec();

    if (!recipe || !(await this.canReadRecipe(recipe, actor))) {
      throw new NotFoundException('Rezept nicht gefunden');
    }

    return this.toRecipeResponse(recipe, actor);
  }

  async create(payload: CreateRecipeDto, actor: AuthenticatedUser) {
    const normalizedPayload = await this.normalizeRecipePayload(payload, actor);
    const scope = await this.resolveRecipeScope(normalizedPayload, actor);
    const recipe = await this.recipeModel.create({
      ...normalizedPayload,
      companyId: scope.companyId,
      locationId: scope.locationId,
      recipeNumber:
        normalizedPayload.recipeNumber ?? (await this.nextRecipeNumber()),
      isActive: normalizedPayload.isActive ?? true,
      visibleInSales: normalizedPayload.visibleInSales ?? true,
      versions: [],
    });
    this.addVersion(recipe, actor.sub);
    return this.toRecipeResponse(await recipe.save(), actor);
  }

  async update(id: string, payload: UpdateRecipeDto, actor: AuthenticatedUser) {
    const recipe = await this.findOne(id, actor);
    const normalizedPayload = await this.normalizeRecipePayload(
      {
        ...recipe.toObject(),
        ...payload,
        ingredients: payload.ingredients ?? recipe.ingredients,
      } as CreateRecipeDto,
      actor,
    );
    const scope = await this.resolveRecipeScope(normalizedPayload, actor);
    recipe.set({
      ...normalizedPayload,
      companyId: scope.companyId,
      locationId: scope.locationId,
    });
    this.addVersion(recipe, actor.sub);
    return this.toRecipeResponse(await recipe.save(), actor);
  }

  async copy(id: string, actor: AuthenticatedUser) {
    const recipe = await this.findOne(id, actor);
    const clone = recipe.toObject() as unknown as Record<string, unknown>;
    delete clone._id;
    clone.recipeNumber = await this.nextRecipeNumber();
    clone.name = `${recipe.name} Kopie`;
    clone.versions = [];
    clone.companyId = recipe.companyId ?? actor.companyId;
    clone.locationId = recipe.locationId;
    const copied = await this.recipeModel.create(clone);
    this.addVersion(copied, actor.sub);
    return this.toRecipeResponse(await copied.save(), actor);
  }

  async archive(id: string, archived: boolean, actor: AuthenticatedUser) {
    const recipe = await this.findOne(id, actor);
    recipe.isArchived = archived;
    recipe.isActive = archived ? false : recipe.isActive;
    this.addVersion(recipe, actor.sub);
    return this.toRecipeResponse(await recipe.save(), actor);
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const recipe = await this.findOne(id, actor);
    if (!recipe.isArchived) {
      throw new BadRequestException(
        'Rezept muss vor dem Loeschen archiviert werden',
      );
    }
    await this.recipeModel.deleteOne({ _id: id }).exec();
    return { deleted: true };
  }

  async costing(id: string, actor: AuthenticatedUser) {
    const recipe = await this.findOne(id, actor);
    return this.calculationService.calculate(recipe);
  }

  async nutrition(id: string, actor: AuthenticatedUser) {
    return this.calculationService.nutrition(await this.findOne(id, actor));
  }

  async allergens(id: string, actor: AuthenticatedUser) {
    const recipe = await this.findOne(id, actor);
    return {
      allergens: this.calculationService.allergens(recipe),
      additives: this.calculationService.additives(recipe),
    };
  }

  async calculate(
    id: string,
    actor: AuthenticatedUser,
    portions = 1,
    locationId?: string,
  ) {
    const recipe = await this.findOne(id, actor);
    if (locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, locationId);
    }
    return {
      costing: this.calculationService.calculate(recipe),
      nutrition: this.calculationService.nutrition(recipe),
      allergens: this.calculationService.allergens(recipe),
      scaledIngredients: recipe.ingredients.map((ingredient) => ({
        stockItemId: ingredient.stockItemId,
        stockItemName: ingredient.stockItemName,
        unit: ingredient.unit,
        purchasePriceNet: ingredient.purchasePriceNet,
        allergens: ingredient.allergens,
        additives: ingredient.additives,
        nutrition: ingredient.nutrition,
        quantity: ingredient.quantity * portions,
      })),
      availability: locationId
        ? await this.inventoryService.checkAvailability(
            recipe,
            locationId,
            portions,
          )
        : undefined,
    };
  }

  async report(actor: AuthenticatedUser) {
    const recipes = await this.recipeModel
      .find({ isArchived: { $ne: true } })
      .sort({ category: 1, name: 1 })
      .exec();
    const scopedRecipes = await this.filterReadableRecipes(recipes, actor);
    return scopedRecipes.map((recipe) => ({
      _id: recipe._id.toString(),
      recipeNumber: recipe.recipeNumber,
      name: recipe.name,
      category: recipe.category,
      salePrice: recipe.salePrice,
      costing: this.calculationService.calculate(recipe),
      allergens: this.calculationService.allergens(recipe),
      nutrition: this.calculationService.nutrition(recipe),
    }));
  }

  private async normalizeRecipePayload(
    payload: CreateRecipeDto,
    actor: AuthenticatedUser,
  ): Promise<CreateRecipeDto> {
    if (payload.menuItemId) {
      await this.assertMenuItemReadable(payload.menuItemId, actor);
    }

    const ingredients = await this.normalizeIngredients(
      payload.ingredients ?? [],
      payload.locationId,
      actor,
    );

    return {
      ...payload,
      ingredients,
    };
  }

  private async normalizeIngredients(
    ingredients: CreateRecipeDto['ingredients'],
    requestedLocationId: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<CreateRecipeDto['ingredients']> {
    if (!ingredients.length) {
      return [];
    }

    const seen = new Set<string>();
    for (const ingredient of ingredients) {
      if (ingredient.quantity <= 0) {
        throw new BadRequestException('Zutatenmenge muss groesser als 0 sein');
      }
      if (!ingredient.unit?.trim()) {
        throw new BadRequestException('Zutateneinheit ist erforderlich');
      }
      if (seen.has(ingredient.stockItemId)) {
        throw new BadRequestException(
          'Ein Lagerartikel darf pro Rezept nur einmal verwendet werden',
        );
      }
      seen.add(ingredient.stockItemId);
    }

    const stockItems = await this.stockItemModel
      .find({ _id: { $in: [...seen] } })
      .exec();
    const stockItemsById = new Map(
      stockItems.map((item) => [item._id.toString(), item]),
    );

    for (const stockItemId of seen) {
      if (!stockItemsById.has(stockItemId)) {
        throw new BadRequestException('Lagerartikel nicht gefunden');
      }
    }

    const locationId =
      requestedLocationId ?? stockItems[0]?.locationId ?? undefined;

    if (locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, locationId);
    }

    return ingredients.map((ingredient) => {
      const stockItem = stockItemsById.get(ingredient.stockItemId)!;
      if (locationId && stockItem.locationId !== locationId) {
        throw new BadRequestException(
          'Alle Rezeptzutaten muessen zum Rezeptstandort gehoeren',
        );
      }

      return {
        ...ingredient,
        stockItemName: stockItem.name,
        unit: ingredient.unit.trim(),
        purchasePriceNet: this.resolveUnitCost(stockItem, {
          purchasePriceNet: ingredient.purchasePriceNet,
        }),
        allergens: ingredient.allergens ?? [],
        additives: ingredient.additives ?? [],
      };
    });
  }

  private async toRecipeResponse(
    recipe: RecipeDocument,
    actor: AuthenticatedUser,
  ): Promise<RecipeResponse> {
    const recipeObject = recipe.toObject() as Recipe & {
      _id: unknown;
      createdAt?: Date;
      updatedAt?: Date;
    };
    const [menuItem, stockItems] = await Promise.all([
      recipe.menuItemId
        ? this.findReadableMenuItem(recipe.menuItemId, actor)
        : Promise.resolve(undefined),
      this.stockItemModel
        .find({
          _id: {
            $in: recipe.ingredients.map((ingredient) => ingredient.stockItemId),
          },
        })
        .exec(),
    ]);
    const stockItemsById = new Map(
      stockItems.map((item) => [item._id.toString(), item]),
    );
    const duplicateStockItemIds = this.duplicateStockItemIds(recipe.ingredients);

    const ingredients = recipe.ingredients.map((ingredient) =>
      this.toIngredientResponse(
        ingredient,
        stockItemsById.get(ingredient.stockItemId),
        duplicateStockItemIds.has(ingredient.stockItemId),
      ),
    );

    const ingredientCost = ingredients.reduce(
      (sum, ingredient) => sum + ingredient.totalCost,
      0,
    );
    const costingRecipe = {
      ...recipeObject,
      ingredients: ingredients.map((ingredient) => ({
        stockItemId: ingredient.stockItemId,
        stockItemName: ingredient.stockItemName,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        purchasePriceNet: ingredient.unitCost,
        wasteFactor: 1,
        isOptional: false,
        allergens: [],
        additives: [],
        nutrition: {
          calories: 0,
          fat: 0,
          saturatedFat: 0,
          carbs: 0,
          sugar: 0,
          protein: 0,
          salt: 0,
        },
      })),
    } as unknown as Recipe;
    const costing = this.calculationService.calculate(costingRecipe);
    const recipeCost = ingredientCost / (recipe.basePortions || 1);
    const menuItemPrice = this.resolveMenuItemPrice(menuItem, recipe.salePrice);
    const expectedMargin = menuItemPrice - recipeCost;
    const expectedMarginPercent =
      menuItemPrice > 0 ? (expectedMargin / menuItemPrice) * 100 : 0;
    const warnings = [
      ...ingredients.flatMap((ingredient) => ingredient.warnings),
      ...this.recipeLevelWarnings(recipe, menuItemPrice),
    ];

    return {
      ...(recipeObject as unknown as Record<string, unknown>),
      _id: recipe._id.toString(),
      id: recipe._id.toString(),
      companyId: recipe.companyId,
      tenantId: recipe.companyId,
      locationId: recipe.locationId,
      recipeNumber: recipe.recipeNumber,
      menuItemId: recipe.menuItemId,
      menuItemName: menuItem?.name,
      menuItemPrice,
      name: recipe.name,
      description: recipe.description,
      category: recipe.category,
      imageUrl: recipe.imageUrl,
      type: recipe.type,
      salePrice: recipe.salePrice,
      vatRate: recipe.vatRate,
      isActive: recipe.isActive,
      visibleInSales: recipe.visibleInSales,
      productionArea: recipe.productionArea,
      preparationTimeMinutes: recipe.preparationTimeMinutes,
      portionSize: recipe.portionSize,
      basePortions: recipe.basePortions,
      isArchived: recipe.isArchived,
      ingredients,
      manualAllergens: recipe.manualAllergens ?? [],
      manualAdditives: recipe.manualAdditives ?? [],
      steps: recipe.steps ?? [],
      costing,
      recipeCost,
      expectedMargin,
      expectedMarginPercent,
      warnings,
      createdAt: recipeObject.createdAt?.toISOString(),
      updatedAt: recipeObject.updatedAt?.toISOString(),
    } as RecipeResponse;
  }

  private toIngredientResponse(
    ingredient: RecipeIngredient,
    stockItem: StockItemDocument | undefined,
    isDuplicate: boolean,
  ): RecipeIngredientResponse {
    const warnings: RecipeWarning[] = [];
    const unitCost = stockItem
      ? this.resolveUnitCost(stockItem, ingredient)
      : (ingredient.purchasePriceNet ?? 0);
    const stockItemName =
      stockItem?.name ?? ingredient.stockItemName ?? ingredient.stockItemId;

    if (!stockItem) {
      warnings.push({
        type: 'missing_stock_item',
        stockItemId: ingredient.stockItemId,
        stockItemName,
        message: `Lagerartikel "${stockItemName}" wurde nicht gefunden.`,
      });
    }

    if (!unitCost) {
      warnings.push({
        type: 'missing_cost',
        stockItemId: ingredient.stockItemId,
        stockItemName,
        message: `Für "${stockItemName}" ist kein Einkaufspreis hinterlegt.`,
      });
    }

    if (stockItem && stockItem.unit && stockItem.unit !== ingredient.unit) {
      warnings.push({
        type: 'unknown_unit',
        stockItemId: ingredient.stockItemId,
        stockItemName,
        message: `Einheit "${ingredient.unit}" weicht vom Lagerartikel "${stockItem.unit}" ab.`,
      });
    }

    if (isDuplicate) {
      warnings.push({
        type: 'duplicate_stock_item',
        stockItemId: ingredient.stockItemId,
        stockItemName,
        message: `"${stockItemName}" ist mehrfach in der Rezeptur enthalten.`,
      });
    }

    return {
      id: ingredient._id?.toString(),
      stockItemId: ingredient.stockItemId,
      stockItemName,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      unitCost,
      totalCost: ingredient.quantity * unitCost,
      purchasePriceNet: unitCost,
      warnings,
    };
  }

  private recipeLevelWarnings(
    recipe: RecipeDocument,
    menuItemPrice: number,
  ): RecipeWarning[] {
    if (menuItemPrice > 0) {
      return [];
    }

    return [
      {
        type: 'missing_price',
        message: recipe.menuItemId
          ? 'Der verknüpfte Verkaufsartikel hat keinen Verkaufspreis.'
          : 'Die Rezeptur ist mit keinem Verkaufsartikel verknüpft und hat keinen Verkaufspreis.',
      },
    ];
  }

  private duplicateStockItemIds(ingredients: RecipeIngredient[]): Set<string> {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const ingredient of ingredients) {
      if (seen.has(ingredient.stockItemId)) {
        duplicates.add(ingredient.stockItemId);
      }
      seen.add(ingredient.stockItemId);
    }
    return duplicates;
  }

  private resolveUnitCost(
    stockItem: StockItemDocument,
    ingredient?: { purchasePriceNet?: number },
  ): number {
    return this.firstPositiveNumber([
      stockItem.unitCost,
      stockItem.averageCost,
      stockItem.purchasePriceNet,
      stockItem.lastPurchasePrice,
      ingredient?.purchasePriceNet,
    ]);
  }

  private resolveMenuItemPrice(
    menuItem: MenuItemDocument | undefined,
    recipeSalePrice: number,
  ): number {
    return this.firstPositiveNumber([
      menuItem?.sellingPrice,
      menuItem?.price,
      recipeSalePrice,
    ]);
  }

  private firstPositiveNumber(values: Array<number | undefined>): number {
    return values.find((value) => typeof value === 'number' && value > 0) ?? 0;
  }

  private async assertMenuItemReadable(
    menuItemId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const menuItem = await this.findReadableMenuItem(menuItemId, actor);
    if (!menuItem) {
      throw new BadRequestException('Verkaufsartikel nicht gefunden');
    }
  }

  private async findReadableMenuItem(
    menuItemId: string,
    actor: AuthenticatedUser,
  ): Promise<MenuItemDocument | undefined> {
    const menuItem = await this.menuItemModel.findById(menuItemId).exec();
    if (!menuItem) {
      return undefined;
    }

    const scopedMenuItem = menuItem as MenuItemDocument & {
      tenantId?: string;
      companyId?: string;
      locationId?: string;
    };
    const companyId = scopedMenuItem.companyId ?? scopedMenuItem.tenantId;
    if (companyId && !this.accessPolicy.canAccessCompany(actor, companyId)) {
      return undefined;
    }
    if (
      scopedMenuItem.locationId &&
      !(await this.accessPolicy.canAccessLocation(actor, scopedMenuItem.locationId))
    ) {
      return undefined;
    }

    return menuItem;
  }

  private async nextRecipeNumber() {
    const count = await this.recipeModel.countDocuments();
    return `R${String(count + 1).padStart(5, '0')}`;
  }

  private addVersion(recipe: RecipeDocument, actorId: string): void {
    recipe.versions.push({
      version: recipe.versions.length + 1,
      changedAt: new Date(),
      changedBy: actorId,
      snapshot: recipe.toObject() as unknown as Record<string, unknown>,
    });
  }

  private async resolveRecipeScope(
    payload: Pick<CreateRecipeDto, 'companyId' | 'locationId' | 'ingredients'>,
    actor: AuthenticatedUser,
  ): Promise<{ companyId?: string; locationId?: string }> {
    let locationId = payload.locationId;

    if (!locationId && payload.ingredients?.length) {
      const firstIngredient = await this.stockItemModel
        .findById(payload.ingredients[0].stockItemId)
        .select('locationId')
        .exec();
      locationId = firstIngredient?.locationId;
    }

    if (locationId) {
      await this.accessPolicy.assertCanAccessLocation(actor, locationId);
      await this.assertIngredientsInLocation(
        payload.ingredients ?? [],
        locationId,
      );
    }

    if (
      payload.companyId &&
      !this.accessPolicy.canAccessCompany(actor, payload.companyId)
    ) {
      throw new ForbiddenException(
        'Keine Berechtigung fuer dieses Unternehmen',
      );
    }

    return {
      companyId: payload.companyId ?? actor.companyId,
      locationId,
    };
  }

  private async assertIngredientsInLocation(
    ingredients: CreateRecipeDto['ingredients'],
    locationId: string,
  ): Promise<void> {
    for (const ingredient of ingredients) {
      const item = await this.stockItemModel
        .findById(ingredient.stockItemId)
        .select('locationId')
        .exec();
      if (!item || item.locationId !== locationId) {
        throw new BadRequestException(
          'Alle Rezeptzutaten muessen zum Rezeptstandort gehoeren',
        );
      }
    }
  }

  private async filterReadableRecipes(
    recipes: RecipeDocument[],
    actor: AuthenticatedUser,
  ): Promise<RecipeDocument[]> {
    const result: RecipeDocument[] = [];
    for (const recipe of recipes) {
      if (await this.canReadRecipe(recipe, actor)) {
        result.push(recipe);
      }
    }
    return result;
  }

  private async canReadRecipe(
    recipe: RecipeDocument,
    actor: AuthenticatedUser,
  ): Promise<boolean> {
    if (
      !this.accessPolicy.canAccessCompany(actor, recipe.companyId) ||
      !(await this.accessPolicy.canAccessLocation(actor, recipe.locationId))
    ) {
      return false;
    }

    if (recipe.locationId || !recipe.ingredients.length) {
      return true;
    }

    const readableLocationIds =
      await this.accessPolicy.getReadableLocationIds(actor);
    const stockItems = await this.stockItemModel
      .find({
        _id: {
          $in: recipe.ingredients.map((ingredient) => ingredient.stockItemId),
        },
      })
      .select('locationId')
      .exec();

    return stockItems.every((item) =>
      readableLocationIds.includes(item.locationId),
    );
  }
}
