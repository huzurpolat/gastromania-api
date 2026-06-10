import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import {
  COST_OF_GOODS_MODULE_KEY,
  REPORTING_MODULE_KEY,
} from '../modules/constants/module-definitions';
import { ModulesService } from '../modules/modules.service';
import {
  TenantModule,
  TenantModuleDocument,
} from '../modules/schemas/tenant-module.schema';
import { Order, OrderDocument, OrderStatus } from '../orders/schemas/order.schema';
import { Recipe, RecipeDocument } from '../recipes/schemas/recipe.schema';
import {
  StockMovement,
  StockMovementDocument,
  StockMovementType,
} from '../stock/schemas/stock-movement.schema';
import { MarginReportsService } from './margin-reports.service';

const email = process.env.COGS_VERIFY_EMAIL ?? 'admin@frittenwerk-demo.demo';
const password = process.env.COGS_VERIFY_PASSWORD ?? 'Demo2026!';

async function verifyCogs() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const authService = app.get(AuthService);
    const marginReportsService = app.get(MarginReportsService);
    const modulesService = app.get(ModulesService);
    const locationModel = app.get<Model<LocationDocument>>(
      getModelToken(Location.name),
    );
    const orderModel = app.get<Model<OrderDocument>>(getModelToken(Order.name));
    const recipeModel = app.get<Model<RecipeDocument>>(
      getModelToken(Recipe.name),
    );
    const stockMovementModel = app.get<Model<StockMovementDocument>>(
      getModelToken(StockMovement.name),
    );
    const tenantModuleModel = app.get<Model<TenantModuleDocument>>(
      getModelToken(TenantModule.name),
    );
    const login = await authService.login({ email, password });
    const user = parseAuthenticatedUser(login.accessToken);

    if (!user.tenantId) {
      throw new Error('COGS-Verify braucht einen Tenant-User');
    }

    const locations = await locationModel
      .find({ tenantId: user.tenantId, isActive: { $ne: false } })
      .lean();
    const locationIds = locations.map((location) => String(location._id));
    const report = await marginReportsService.getMargins(user, {
      range: 'month',
      groupBy: 'menuItem',
    });
    const categoryReport = await marginReportsService.getMargins(user, {
      range: 'month',
      groupBy: 'category',
    });
    const orderIds = (
      await orderModel
        .find({
          tenantId: user.tenantId,
          locationId: { $in: locationIds },
          status: {
            $in: [
              OrderStatus.Accepted,
              OrderStatus.Preparing,
              OrderStatus.Ready,
              OrderStatus.Served,
              OrderStatus.Closed,
            ],
          },
        })
        .select('_id')
        .lean()
    ).map((order) => String(order._id));
    const [recipesCount, stockMovementsCount, unsafeStockMovements] =
      await Promise.all([
        recipeModel
          .countDocuments({
            isArchived: { $ne: true },
            $or: [
              { locationId: { $exists: false } },
              { locationId: '' },
              { locationId: { $in: locationIds } },
            ],
          })
          .exec(),
        stockMovementModel
          .countDocuments({
            locationId: { $in: locationIds },
            type: { $in: cogsMovementTypes() },
            $or: [
              { referenceType: 'order', referenceId: { $in: orderIds } },
              { orderId: { $in: orderIds } },
            ],
          })
          .exec(),
        stockMovementModel
          .countDocuments({
            locationId: { $in: locationIds },
            tenantId: { $exists: true, $nin: [user.tenantId, '', null] },
          })
          .exec(),
      ]);
    const invalidReportLocations = report.locations.filter(
      (location) => !locationIds.includes(location.locationId),
    );
    const costOfGoodsModuleBlocked = await verifyModuleBlock(
      modulesService,
      tenantModuleModel,
      user.tenantId,
      COST_OF_GOODS_MODULE_KEY,
    );
    await modulesService.assertEnabledForTenant(REPORTING_MODULE_KEY, user.tenantId);
    const failures = [
      orderIds.length > 0 ? '' : 'Frittenwerk Demo hat keine relevanten Orders',
      recipesCount > 0 ? '' : 'Frittenwerk Demo hat keine Recipes',
      stockMovementsCount > 0
        ? ''
        : 'Frittenwerk Demo hat keine Order-StockMovements',
      report.summary.revenue > 0 ? '' : 'Revenue ist 0',
      report.summary.costOfGoods > 0 ? '' : 'COGS ist 0',
      Number.isFinite(report.summary.contributionMargin)
        ? ''
        : 'Marge ist nicht berechenbar',
      Number.isFinite(report.summary.averageMarginPercent)
        ? ''
        : 'Marge % ist nicht berechenbar',
      report.costBasis === 'StockMovement.valueNet'
        ? ''
        : `Kostenbasis ist nicht StockMovement.valueNet: ${report.costBasis}`,
      report.items?.length ? '' : 'COGS-Report liefert keine UI-Items',
      categoryReport.items?.some((item) => item.groupBy === 'category')
        ? ''
        : 'COGS-Report gruppiert nicht nach Kategorien',
      Array.isArray(report.warningDetails)
        ? ''
        : 'COGS-Report liefert keine strukturierten Warnungen',
      costOfGoodsModuleBlocked
        ? ''
        : 'cost_of_goods Modul blockiert nicht tenantbezogen',
      unsafeStockMovements === 0
        ? ''
        : `${unsafeStockMovements} fremde StockMovements in Tenant-Standorten gefunden`,
      invalidReportLocations.length === 0
        ? ''
        : `Report enthaelt fremde Standorte: ${invalidReportLocations
            .map((location) => location.locationName)
            .join(', ')}`,
    ].filter(Boolean);

    if (failures.length) {
      throw new Error(`COGS-Verify fehlgeschlagen:\n- ${failures.join('\n- ')}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          tenantId: user.tenantId,
          orders: orderIds.length,
          recipes: recipesCount,
          stockMovements: stockMovementsCount,
          revenue: report.summary.revenue,
          costOfGoods: report.summary.costOfGoods,
          contributionMargin: report.summary.contributionMargin,
          averageMarginPercent: report.summary.averageMarginPercent,
          reportItems: report.items?.length ?? 0,
          warningDetails: report.warningDetails?.length ?? 0,
          costOfGoodsModuleBlocked,
          unsafeStockMovements,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
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

function cogsMovementTypes(): StockMovementType[] {
  return [
    StockMovementType.OrderConsumption,
    StockMovementType.OrderQuantityAdjustment,
    StockMovementType.OrderCancelReversal,
  ];
}

function parseAuthenticatedUser(accessToken: string): AuthenticatedUser {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
  ) as Partial<AuthenticatedUser>;

  if (!payload.sub || !payload.email || !Array.isArray(payload.roles)) {
    throw new Error('COGS-Verify konnte JWT-Payload nicht lesen');
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

void verifyCogs();
