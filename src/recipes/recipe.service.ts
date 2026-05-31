import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateRecipeDto, UpdateRecipeDto } from './dto/recipe.dto';
import { RecipeCalculationService } from './recipe-calculation.service';
import { RecipeInventoryService } from './recipe-inventory.service';
import { Recipe, RecipeDocument } from './schemas/recipe.schema';

@Injectable()
export class RecipeService {
  constructor(
    @InjectModel(Recipe.name)
    private readonly recipeModel: Model<RecipeDocument>,
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
    const recipes = await this.recipeModel.find(query).sort({ name: 1 }).lean();
    return recipes.map((recipe) => ({
      ...recipe,
      costing: this.calculationService.calculate(recipe as Recipe),
    }));
  }

  async findOne(id: string, _actor?: AuthenticatedUser): Promise<RecipeDocument> {
    const recipe = await this.recipeModel.findById(id).exec();
    if (!recipe) throw new NotFoundException('Rezept nicht gefunden');
    return recipe;
  }

  async create(payload: CreateRecipeDto, actor: AuthenticatedUser) {
    const recipe = await this.recipeModel.create({
      ...payload,
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
    recipe.set(payload);
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

  async report(_actor: AuthenticatedUser) {
    const recipes = await this.recipeModel
      .find({ isArchived: { $ne: true } })
      .sort({ category: 1, name: 1 })
      .exec();
    return recipes.map((recipe) => ({
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
}
