import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { DashboardService } from './dashboard.service';
import {
  Order,
  OrderDocument,
  OrderSource,
  OrderStatus,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import {
  Reservation,
  ReservationDocument,
} from '../reservations/schemas/reservation.schema';
import {
  StockItem,
  StockItemDocument,
} from '../stock/schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementDocument,
  StockMovementType,
} from '../stock/schemas/stock-movement.schema';
import {
  RestaurantTable,
  RestaurantTableDocument,
} from '../tables/schemas/table.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

const email = process.env.DASHBOARD_VERIFY_EMAIL ?? 'admin@gastromania-demo.de';
const password = process.env.DASHBOARD_VERIFY_PASSWORD ?? 'Demo2026!';

async function verifyDashboard() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const authService = app.get(AuthService);
    const dashboardService = app.get(DashboardService);
    const orderModel = app.get<Model<OrderDocument>>(getModelToken(Order.name));
    const reservationModel = app.get<Model<ReservationDocument>>(
      getModelToken(Reservation.name),
    );
    const stockItemModel = app.get<Model<StockItemDocument>>(
      getModelToken(StockItem.name),
    );
    const stockMovementModel = app.get<Model<StockMovementDocument>>(
      getModelToken(StockMovement.name),
    );
    const tableModel = app.get<Model<RestaurantTableDocument>>(
      getModelToken(RestaurantTable.name),
    );
    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    const login = await authService.login({ email, password });
    const user = parseAuthenticatedUser(login.accessToken);
    const today = dayRange(new Date());
    const locationFilter = user.locationIds?.length
      ? { locationId: { $in: user.locationIds } }
      : {};
    const [
      ordersTotal,
      ordersToday,
      reservationsTotal,
      reservationsToday,
      stockItems,
      shrinkageToday,
      tables,
      users,
      counterOrdersToday,
      openCounterOrders,
      openPayments,
      overview,
      sales,
      orders,
      inventory,
      reservations,
      employees,
      finance,
    ] = await Promise.all([
      orderModel.countDocuments(locationFilter).exec(),
      orderModel
        .countDocuments({
          ...locationFilter,
          createdAt: { $gte: today.from, $lte: today.to },
        })
        .exec(),
      reservationModel.countDocuments(locationFilter).exec(),
      reservationModel
        .countDocuments({
          ...locationFilter,
          startTime: { $gte: today.from, $lte: today.to },
        })
        .exec(),
      stockItemModel.countDocuments(locationFilter).exec(),
      stockMovementModel
        .countDocuments({
          ...locationFilter,
          type: {
            $in: [
              StockMovementType.Shrinkage,
              StockMovementType.Breakage,
              StockMovementType.Spoilage,
              StockMovementType.Loss,
            ],
          },
          createdAt: { $gte: today.from, $lte: today.to },
        })
        .exec(),
      tableModel.countDocuments(locationFilter).exec(),
      userModel
        .countDocuments({
          $or: [
            { locationId: { $in: user.locationIds ?? [] } },
            { locationIds: { $in: user.locationIds ?? [] } },
          ],
        })
        .exec(),
      orderModel
        .countDocuments({
          ...locationFilter,
          source: OrderSource.Counter,
          createdAt: { $gte: today.from, $lte: today.to },
          status: { $ne: OrderStatus.Cancelled },
        })
        .exec(),
      orderModel
        .countDocuments({
          ...locationFilter,
          source: OrderSource.Counter,
          status: {
            $in: [
              OrderStatus.New,
              OrderStatus.Accepted,
              OrderStatus.Preparing,
              OrderStatus.Ready,
            ],
          },
        })
        .exec(),
      orderModel
        .countDocuments({
          ...locationFilter,
          paymentStatus: { $ne: PaymentStatus.Paid },
          status: { $nin: [OrderStatus.Cancelled, OrderStatus.Closed] },
        })
        .exec(),
      dashboardService.overview(user, { range: 'today' }),
      dashboardService.sales(user, { range: 'today' }),
      dashboardService.orders(user, { range: 'today' }),
      dashboardService.inventory(user, { range: 'today' }),
      dashboardService.reservations(user, { range: 'today' }),
      dashboardService.employees(user, { range: 'today' }),
      dashboardService.finance(user, { range: 'today' }),
    ]);
    const failures = [
      ordersToday > 0 ? '' : 'ordersToday ist 0',
      reservationsToday > 0 ? '' : 'reservationsToday ist 0',
      stockItems > 0 ? '' : 'stockItems ist 0',
      shrinkageToday > 0 ? '' : 'shrinkageToday ist 0',
      tables > 0 ? '' : 'tables ist 0',
      users > 0 ? '' : 'users ist 0',
      counterOrdersToday > 0 ? '' : 'counterOrdersToday ist 0',
      openCounterOrders > 0 ? '' : 'openCounterOrders ist 0',
      openPayments > 0 ? '' : 'openPayments ist 0',
      overview.kpis.ordersToday > 0 ? '' : 'Dashboard ordersToday ist 0',
      overview.kpis.reservationsToday > 0
        ? ''
        : 'Dashboard reservationsToday ist 0',
      overview.kpis.inventoryValue > 0 ? '' : 'Dashboard inventoryValue ist 0',
      overview.kpis.employeesInService > 0
        ? ''
        : 'Dashboard employeesInService ist 0',
      overview.kpis.counterOrdersToday > 0
        ? ''
        : 'Dashboard counterOrdersToday ist 0',
      overview.kpis.openCounterOrders > 0
        ? ''
        : 'Dashboard openCounterOrders ist 0',
      overview.kpis.openPayments > 0 ? '' : 'Dashboard openPayments ist 0',
      overview.kpis.kitchenOrders > 0 ? '' : 'Dashboard kitchenOrders ist 0',
      overview.kpis.readyForPickupOrders > 0
        ? ''
        : 'Dashboard readyForPickupOrders ist 0',
      overview.kpis.shrinkageToday > 0 ? '' : 'Dashboard shrinkageToday ist 0',
      finance.dayRevenue > 0 ? '' : 'Dashboard dayRevenue ist 0',
    ].filter(Boolean);

    console.log(
      JSON.stringify(
        {
          email,
          user: {
            roles: user.roles,
            locationIds: user.locationIds,
          },
          database: {
            ordersTotal,
            ordersToday,
            reservationsTotal,
            reservationsToday,
            stockItems,
            shrinkageToday,
            tables,
            users,
            counterOrdersToday,
            openCounterOrders,
            openPayments,
          },
          dashboard: {
            overview: overview.kpis,
            salesTimeline: sales.timeline,
            ordersByStatus: orders.byStatus,
            inventory: inventory.summary,
            reservationsByStatus: reservations.byStatus,
            employees: {
              activeUsers: employees.activeUsers,
              inService: employees.inService,
              plannedShifts: employees.plannedShifts.length,
              openTimeEntries: employees.openTimeEntries.length,
            },
            finance,
          },
        },
        null,
        2,
      ),
    );

    if (failures.length) {
      throw new Error(
        `Dashboard-Verifikation fehlgeschlagen: ${failures.join(', ')}`,
      );
    }
  } finally {
    await app.close();
  }
}

function dayRange(date: Date) {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(date);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function parseAuthenticatedUser(accessToken: string): AuthenticatedUser {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'),
  ) as Partial<AuthenticatedUser>;

  if (!payload.sub || !payload.email || !Array.isArray(payload.roles)) {
    throw new Error('Dashboard-Verifikation konnte JWT-Payload nicht lesen');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    roles: payload.roles,
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
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

void verifyDashboard();
