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
  StockItem,
  StockItemDocument,
} from '../stock/schemas/stock-item.schema';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipe.dto';
import { RecipeCalculationService } from './recipe-calculation.service';
import { RecipeInventoryService } from './recipe-inventory.service';
import { Recipe, RecipeDocument } from './schemas/recipe.schema';

@Injectable()
export class RecipeService {
  constructor(
    @InjectModel(Recipe.name)
    private readonly recipeModel: Model<RecipeDocument>,
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
    return scopedRecipes.map((recipe) => ({
      ...recipe.toObject(),
      costing: this.calculationService.calculate(recipe),
    }));
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

  async create(payload: CreateRecipeDto, actor: AuthenticatedUser) {
    const scope = await this.resolveRecipeScope(payload, actor);
    const recipe = await this.recipeModel.create({
      ...payload,
      companyId: scope.companyId,
      locationId: scope.locationId,
      recipeNumber: payload.recipeNumber ?? (await this.nextRecipeNumber()),
      isActive: payload.isActive ?? true,
      visibleInSales: payload.visibleInSales ?? true,
      versions: [],
    });
    this.addVersion(recipe, actor.sub);
    return recipe.save();
  }

  async update(id: string, payload: UpdateRecipeDto, actor: AuthenticatedUser) {
    const recipe = await this.findOne(id, actor);
    const scope = await this.resolveRecipeScope(
      {
        ...recipe.toObject(),
        ...payload,
        ingredients: payload.ingredients ?? recipe.ingredients,
      } as CreateRecipeDto,
      actor,
    );
    recipe.set({
      ...payload,
      companyId: scope.companyId,
      locationId: scope.locationId,
    });
    this.addVersion(recipe, actor.sub);
    return recipe.save();
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
    return copied.save();
  }

  async archive(id: string, archived: boolean, actor: AuthenticatedUser) {
    const recipe = await this.findOne(id, actor);
    recipe.isArchived = archived;
    recipe.isActive = archived ? false : recipe.isActive;
    this.addVersion(recipe, actor.sub);
    return recipe.save();
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
      !(await this.accessPolicy.canAccessCompany(actor, payload.companyId))
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
      !(await this.accessPolicy.canAccessCompany(actor, recipe.companyId)) ||
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
