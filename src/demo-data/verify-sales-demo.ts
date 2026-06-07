import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import {
  MenuItem,
  MenuItemDocument,
} from '../menu-items/schemas/menu-item.schema';
import {
  Order,
  OrderDocument,
  OrderTenantResolutionStatus,
} from '../orders/schemas/order.schema';
import {
  RestaurantTable,
  RestaurantTableDocument,
} from '../tables/schemas/table.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

const demoUserEmails = [
  'admin@gastromania-demo.de',
  'filialleiter@gastromania-demo.de',
  'service@gastromania-demo.de',
  'kueche@gastromania-demo.de',
  'bar@gastromania-demo.de',
  'theke@gastromania-demo.de',
];

const demoProducts = [
  { name: 'Wasser 0,25', category: 'Getränke' },
  { name: 'Coca Cola 0,33', category: 'Getränke' },
  { name: 'Fanta 0,33', category: 'Getränke' },
  { name: 'Pils', category: 'Getränke' },
  { name: 'Weizen', category: 'Getränke' },
  { name: 'Burger Classic', category: 'Speisen' },
  { name: 'Cheeseburger', category: 'Speisen' },
  { name: 'Pommes', category: 'Speisen' },
  { name: 'Salat', category: 'Speisen' },
  { name: 'Kaffee', category: 'Kaffee' },
  { name: 'Cappuccino', category: 'Kaffee' },
  { name: 'Espresso', category: 'Kaffee' },
];

async function verifySalesDemo() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const authService = app.get(AuthService);
    const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
    const locationModel = app.get<Model<LocationDocument>>(
      getModelToken(Location.name),
    );
    const tableModel = app.get<Model<RestaurantTableDocument>>(
      getModelToken(RestaurantTable.name),
    );
    const orderModel = app.get<Model<OrderDocument>>(
      getModelToken(Order.name),
    );
    const menuItemModel = app.get<Model<MenuItemDocument>>(
      getModelToken(MenuItem.name),
    );
    const location = await locationModel
      .findOne({ email: 'demo@gastrowerk24.de' })
      .lean()
      .exec();
    const locationId = location?._id?.toString();
    const users = await userModel
      .find({ email: { $in: demoUserEmails } })
      .lean()
      .exec();
    const tables = locationId
      ? await tableModel.countDocuments({ locationId }).exec()
      : 0;
    const menuItems = await menuItemModel
      .countDocuments({
        $or: demoProducts.map((product) => ({
          name: product.name,
          category: product.category,
        })),
      })
      .exec();
    const unsafeVisibleOrders = await orderModel
      .countDocuments({
        $or: [
          {
            tenantId: { $exists: false },
            tenantResolutionStatus: {
              $ne: OrderTenantResolutionStatus.LegacyOrphan,
            },
          },
          {
            tenantId: null,
            tenantResolutionStatus: {
              $ne: OrderTenantResolutionStatus.LegacyOrphan,
            },
          },
          {
            tenantId: '',
            tenantResolutionStatus: {
              $ne: OrderTenantResolutionStatus.LegacyOrphan,
            },
          },
        ],
      })
      .exec();
    const legacyOrphanOrders = await orderModel
      .countDocuments({
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: '' },
        ],
        tenantResolutionStatus: OrderTenantResolutionStatus.LegacyOrphan,
      })
      .exec();
    const adminLogin = await authService.login({
      email: 'admin@gastromania-demo.de',
      password: 'Demo2026!',
    });
    const serviceLogin = await authService.login({
      email: 'service@gastromania-demo.de',
      password: 'Demo2026!',
    });

    console.log(
      JSON.stringify(
        {
          locationFound: Boolean(location),
          locationId,
          users: users.length,
          missingUsers: demoUserEmails.filter(
            (email) => !users.some((user) => user.email === email),
          ),
          tables,
          menuItems,
          unsafeVisibleOrders,
          legacyOrphanOrders,
          logins: {
            admin: Boolean(adminLogin.accessToken),
            service: Boolean(serviceLogin.accessToken),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

void verifySalesDemo();
