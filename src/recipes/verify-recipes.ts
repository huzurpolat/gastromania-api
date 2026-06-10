import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { MenuItem, MenuItemDocument } from '../menu-items/schemas/menu-item.schema';
import { RECIPES_MODULE_KEY } from '../modules/constants/module-definitions';
import { ModulesService } from '../modules/modules.service';
import {
  TenantModule,
  TenantModuleDocument,
} from '../modules/schemas/tenant-module.schema';
import { StockItem, StockItemDocument } from '../stock/schemas/stock-item.schema';
import { RecipeService } from './recipe.service';
import { Recipe, RecipeDocument, RecipeType } from './schemas/recipe.schema';

const email = process.env.RECIPES_VERIFY_EMAIL ?? 'admin@frittenwerk-demo.demo';
const password = process.env.RECIPES_VERIFY_PASSWORD ?? 'Demo2026!';

async function verifyRecipes() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const authService = app.get(AuthService);
    const recipeService = app.get(RecipeService);
    const modulesService = app.get(ModulesService);
    const locationModel = app.get<Model<LocationDocument>>(
      getModelToken(Location.name),
    );
    const menuItemModel = app.get<Model<MenuItemDocument>>(
      getModelToken(MenuItem.name),
    );
    const stockItemModel = app.get<Model<StockItemDocument>>(
      getModelToken(StockItem.name),
    );
    const recipeModel = app.get<Model<RecipeDocument>>(
      getModelToken(Recipe.name),
    );
    const tenantModuleModel = app.get<Model<TenantModuleDocument>>(
      getModelToken(TenantModule.name),
    );

    const login = await authService.login({ email, password });
    const user = parseAuthenticatedUser(login.accessToken);

    if (!user.tenantId) {
      throw new Error('Recipes-Verify braucht einen Tenant-User');
    }

    await modulesService.assertEnabledForTenant(RECIPES_MODULE_KEY, user.tenantId);

    const locations = await locationModel
      .find({ tenantId: user.tenantId, isActive: { $ne: false } })
      .lean()
      .exec();
    assert(locations.length, 'Frittenwerk Demo hat keinen aktiven Standort');
    const locationIds = locations.map((location) => String(location._id));

    const [menuItem, pricedStockItem] = await Promise.all([
      menuItemModel.findOne({ isActive: { $ne: false } }).lean().exec(),
      stockItemModel
        .findOne({
          locationId: { $in: locationIds },
          isArchived: { $ne: true },
          $or: [
            { unitCost: { $gt: 0 } },
            { averageCost: { $gt: 0 } },
            { purchasePriceNet: { $gt: 0 } },
            { lastPurchasePrice: { $gt: 0 } },
          ],
        })
        .lean()
        .exec(),
    ]);
    assert(menuItem, 'Es existiert kein Verkaufsartikel fuer Rezepturen');
    assert(pricedStockItem, 'Frittenwerk Demo hat keinen bepreisten Lagerartikel');
    const location = locations.find(
      (entry) => String(entry._id) === pricedStockItem.locationId,
    );
    assert(location, 'Bepreister Lagerartikel gehoert zu keinem aktiven Standort');

    const zeroCostStockItem = await ensureZeroCostStockItem(
      stockItemModel,
      String(location._id),
      user.tenantId,
    );
    const recipeName = 'Verify Rezeptur Wareneinsatz';
    const existingRecipe = await recipeModel
      .findOne({ companyId: user.companyId, name: recipeName })
      .exec();
    const payload = {
      companyId: user.companyId,
      locationId: String(location._id),
      menuItemId: String(menuItem._id),
      name: recipeName,
      description: 'Automatische Verify-Rezeptur fuer Rezeptkosten und Warnungen',
      category: menuItem.category ?? 'Verify',
      type: RecipeType.Food,
      salePrice: menuItem.sellingPrice ?? menuItem.price ?? 1,
      vatRate: 19,
      isActive: true,
      visibleInSales: false,
      basePortions: 1,
      portionSize: '1 Portion',
      ingredients: [
        {
          stockItemId: String(pricedStockItem._id),
          quantity: 1,
          unit: pricedStockItem.unit,
        },
        {
          stockItemId: String(zeroCostStockItem._id),
          quantity: 1,
          unit: zeroCostStockItem.unit,
        },
      ],
    };
    const recipe = existingRecipe
      ? await recipeService.update(String(existingRecipe._id), payload, user)
      : await recipeService.create(payload, user);
    const byMenuItem = await recipeService.findByMenuItem(String(menuItem._id), user);
    const foreignStockItem = await ensureForeignStockItem(
      stockItemModel,
      locationModel,
      user.tenantId,
    );
    const crossTenantIngredientBlocked = await verifyCrossTenantIngredientBlock(
      recipeService,
      user,
      String(location._id),
      String(menuItem._id),
      String(foreignStockItem._id),
      foreignStockItem.unit,
    );
    const recipesModuleBlocked = await verifyModuleBlock(
      modulesService,
      tenantModuleModel,
      user.tenantId,
      RECIPES_MODULE_KEY,
    );

    const failures = [
      recipe.recipeCost > 0 ? '' : 'recipeCost ist 0',
      Number.isFinite(recipe.expectedMargin)
        ? ''
        : 'expectedMargin ist nicht berechenbar',
      Number.isFinite(recipe.expectedMarginPercent)
        ? ''
        : 'expectedMarginPercent ist nicht berechenbar',
      recipe.ingredients.length >= 2 ? '' : 'Zutaten wurden nicht geladen',
      recipe.ingredients.every((ingredient) => ingredient.totalCost >= 0)
        ? ''
        : 'Zutatenkosten sind unvollstaendig',
      recipe.warnings.some((warning) => warning.type === 'missing_cost')
        ? ''
        : 'Missing-Cost-Warnung fehlt',
      byMenuItem._id === recipe._id ? '' : 'findByMenuItem liefert falsche Rezeptur',
      crossTenantIngredientBlocked
        ? ''
        : 'Fremder Lagerartikel wurde nicht blockiert',
      recipesModuleBlocked ? '' : 'recipes Modul blockiert nicht tenantbezogen',
    ].filter(Boolean);

    if (failures.length) {
      throw new Error(
        `Recipes-Verify fehlgeschlagen:\n- ${failures.join('\n- ')}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          tenantId: user.tenantId,
          locationId: String(location._id),
          menuItemId: String(menuItem._id),
          recipeId: recipe._id,
          recipeCost: recipe.recipeCost,
          expectedMargin: recipe.expectedMargin,
          expectedMarginPercent: recipe.expectedMarginPercent,
          ingredientCount: recipe.ingredients.length,
          warningTypes: recipe.warnings.map((warning) => warning.type),
          crossTenantIngredientBlocked,
          recipesModuleBlocked,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

async function ensureZeroCostStockItem(
  stockItemModel: Model<StockItemDocument>,
  locationId: string,
  tenantId: string,
) {
  return stockItemModel
    .findOneAndUpdate(
      { locationId, name: 'Verify Rezeptur Nullkosten' },
      {
        $set: {
          tenantId,
          locationId,
          name: 'Verify Rezeptur Nullkosten',
          category: 'Verify',
          unit: 'Stück',
          quantity: 10,
          minQuantity: 0,
          criticalQuantity: 0,
          purchasePriceNet: 0,
          lastPurchasePrice: 0,
          averageCost: 0,
          unitCost: 0,
          purchasePriceGross: 0,
          salePrice: 0,
          vatRate: 19,
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    )
    .lean()
    .exec();
}

async function ensureForeignStockItem(
  stockItemModel: Model<StockItemDocument>,
  locationModel: Model<LocationDocument>,
  tenantId: string,
) {
  const foreignLocation = await locationModel
    .findOne({ tenantId: { $ne: tenantId }, isActive: { $ne: false } })
    .lean()
    .exec();
  assert(foreignLocation, 'Es existiert kein fremder Standort fuer Cross-Tenant-Test');

  return stockItemModel
    .findOneAndUpdate(
      { locationId: String(foreignLocation._id), name: 'Verify Fremde Zutat' },
      {
        $set: {
          tenantId: foreignLocation.tenantId,
          locationId: String(foreignLocation._id),
          name: 'Verify Fremde Zutat',
          category: 'Verify',
          unit: 'kg',
          quantity: 10,
          minQuantity: 0,
          criticalQuantity: 0,
          purchasePriceNet: 1,
          lastPurchasePrice: 1,
          averageCost: 1,
          unitCost: 1,
          purchasePriceGross: 1.19,
          salePrice: 0,
          vatRate: 19,
          isActive: true,
          isArchived: false,
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    )
    .lean()
    .exec();
}

async function verifyCrossTenantIngredientBlock(
  recipeService: RecipeService,
  user: AuthenticatedUser,
  locationId: string,
  menuItemId: string,
  stockItemId: string,
  unit: string,
): Promise<boolean> {
  try {
    await recipeService.create(
      {
        companyId: user.companyId,
        locationId,
        menuItemId,
        name: 'Verify Fremde Rezeptur',
        category: 'Verify',
        type: RecipeType.Food,
        salePrice: 1,
        ingredients: [{ stockItemId, quantity: 1, unit }],
      },
      user,
    );
    return false;
  } catch {
    return true;
  }
}

async function verifyModuleBlock(
  modulesService: ModulesService,
  tenantModuleModel: Model<TenantModuleDocument>,
  tenantId: string,
  moduleKey: string,
): Promise<boolean> {
  const currentModule = await tenantModuleModel
    .findOne({ tenantId, moduleKey })
    .lean()
    .exec();
  const previousEnabled = currentModule?.enabled ?? true;

  await tenantModuleModel
    .updateOne(
      { tenantId, moduleKey },
      { $set: { tenantId, moduleKey, enabled: false } },
      { upsert: true },
    )
    .exec();

  try {
    await modulesService.assertEnabledForTenant(moduleKey, tenantId);
    return false;
  } catch {
    return true;
  } finally {
    await tenantModuleModel
      .updateOne(
        { tenantId, moduleKey },
        { $set: { tenantId, moduleKey, enabled: previousEnabled } },
        { upsert: true },
      )
      .exec();
  }
}

function parseAuthenticatedUser(accessToken: string): AuthenticatedUser {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
  ) as Partial<AuthenticatedUser>;

  if (!payload.sub || !payload.email || !Array.isArray(payload.roles)) {
    throw new Error('Recipes-Verify konnte JWT-Payload nicht lesen');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    roles: payload.roles,
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    tenantId: payload.tenantId,
    companyId: payload.companyId,
    regionIds: Array.isArray(payload.regionIds) ? payload.regionIds : [],
    locationIds: Array.isArray(payload.locationIds) ? payload.locationIds : [],
    managedLocationIds: Array.isArray(payload.managedLocationIds)
      ? payload.managedLocationIds
      : [],
    departmentIds: Array.isArray(payload.departmentIds)
      ? payload.departmentIds
      : [],
  };
}

function assert<T>(value: T | null | undefined, message: string): asserts value is T {
  if (!value) {
    throw new Error(message);
  }
}

void verifyRecipes();
