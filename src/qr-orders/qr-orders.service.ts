import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company } from '../companies/schemas/company.schema';
import { Location } from '../locations/schemas/location.schema';
import { MenuItem } from '../menu-items/schemas/menu-item.schema';
import {
  DIGITAL_MENU_MODULE_KEY,
  QR_ORDERS_MODULE_KEY,
} from '../modules/constants/module-definitions';
import { ModulesService } from '../modules/modules.service';
import {
  CourseType,
  Order,
  OrderDocument,
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  OrderTenantResolutionStatus,
  PaymentMethod,
  PaymentStatus,
  ProductionArea,
} from '../orders/schemas/order.schema';
import { RealtimeService } from '../realtime/realtime.service';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableStatus,
} from '../tables/schemas/table.schema';
import { CreatePublicQrOrderDto } from './dto/public-qr-order.dto';

interface ValidatedQrContext {
  table: RestaurantTableDocument;
  location: Location & { _id: unknown };
  company?: Company & { _id: unknown };
}

@Injectable()
export class QrOrdersService {
  constructor(
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<Location>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<Company>,
    @InjectModel(MenuItem.name)
    private readonly menuItemModel: Model<MenuItem>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly realtimeService: RealtimeService,
    private readonly modulesService: ModulesService,
  ) {}

  async getPublicMenu(token: string) {
    const context = await this.validateToken(token);
    await this.assertPublicModuleEnabled(context, DIGITAL_MENU_MODULE_KEY);
    const menuItems = await this.menuItemModel
      .find({ isActive: true })
      .sort({ category: 1, name: 1 })
      .lean();

    return {
      company: context.company
        ? {
            id: this.stringifyId(context.company._id),
            name: context.company.name,
          }
        : undefined,
      location: {
        id: this.stringifyId(context.location._id),
        name: context.location.name,
        city: context.location.city,
      },
      table: {
        id: context.table._id.toString(),
        name: context.table.tableName ?? context.table.name,
        number: context.table.tableNumber,
        seats: context.table.seats,
      },
      menu: {
        qrMenuId: context.table.qrMenuId,
        categories: [...new Set(menuItems.map((item) => item.category))].sort(),
        items: menuItems.map((item) => ({
          id: this.stringifyId(item._id),
          name: item.name,
          category: item.category,
          description: item.description,
          imageUrl: item.imageUrl,
          price: item.sellingPrice ?? item.price,
          isKitchenItem: item.isKitchenItem,
          isVegan: item.isVegan,
          containsNuts: item.containsNuts,
          available: item.isActive,
        })),
      },
    };
  }

  async createOrder(
    token: string,
    dto: CreatePublicQrOrderDto,
    metadata: { userAgent?: string } = {},
  ) {
    const context = await this.validateToken(token);
    await this.assertPublicModuleEnabled(context, QR_ORDERS_MODULE_KEY);
    const itemIds = [...new Set(dto.items.map((item) => item.menuItemId))];
    const menuItems = await this.menuItemModel
      .find({ _id: { $in: itemIds }, isActive: true })
      .lean();
    const menuById = new Map(
      menuItems.map((item) => [this.stringifyId(item._id), item]),
    );

    if (menuItems.length !== itemIds.length) {
      throw new BadRequestException(
        'Ein oder mehrere Artikel sind nicht verfuegbar',
      );
    }

    const orderItems = dto.items.map((item) => {
      const menuItem = menuById.get(item.menuItemId);
      if (!menuItem) {
        throw new BadRequestException('Artikel ist nicht verfuegbar');
      }
      const note = this.cleanText(item.note);
      const price = menuItem.sellingPrice ?? menuItem.price;

      return {
        menuItemId: this.stringifyId(menuItem._id),
        productId: this.stringifyId(menuItem._id),
        name: menuItem.name,
        quantity: item.quantity,
        price,
        totalPrice: this.roundMoney(item.quantity * price),
        note,
        isKitchenItem: menuItem.isKitchenItem,
        status: OrderItemStatus.Open,
        productionArea: menuItem.isKitchenItem
          ? ProductionArea.Kitchen
          : ProductionArea.Bar,
        courseType: CourseType.Main,
        specialRequests: note ? [note] : [],
        allergens: [],
      };
    });
    const subtotal = this.roundMoney(
      orderItems.reduce((sum, item) => sum + item.totalPrice, 0),
    );
    const guestNote = this.cleanText(
      [dto.guestNote, dto.allergyNote].filter(Boolean).join(' | '),
    );
    const order = await this.orderModel.create({
      companyId: context.location.companyId,
      tenantId: context.location.tenantId,
      tenantResolutionStatus: OrderTenantResolutionStatus.Resolved,
      tenantResolvedAt: new Date(),
      locationId: this.stringifyId(context.location._id),
      tableId: context.table._id.toString(),
      source: OrderSource.Qr,
      status: OrderStatus.New,
      paymentStatus: PaymentStatus.Open,
      paymentMethod: PaymentMethod.Other,
      guestCount: 1,
      orderNumber: await this.nextOrderNumber(
        this.stringifyId(context.location._id),
      ),
      pickupNumber: undefined,
      customerName: this.cleanText(dto.customerName),
      guestNote,
      notes: guestNote,
      qrTokenId: token,
      qrUserAgent: this.cleanText(metadata.userAgent),
      items: orderItems,
      subtotal,
      tax: this.roundMoney(subtotal * 0.19),
      total: subtotal,
      statusTimestamps: {
        [OrderStatus.New]: new Date(),
      },
    });

    await this.syncTableForQrOrder(context.table, order);
    this.realtimeService.publish('qr.order.created', {
      order,
      tableId: context.table._id.toString(),
      locationId: order.locationId,
      channels: this.eventChannels(order.companyId, order.locationId),
    });
    this.realtimeService.publish('order.created', order);

    return {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      status: order.status,
      table: {
        id: context.table._id.toString(),
        name: context.table.tableName ?? context.table.name,
      },
      total: order.total,
    };
  }

  async getOrderStatus(token: string, orderId: string) {
    const context = await this.validateToken(token);
    await this.assertPublicModuleEnabled(context, QR_ORDERS_MODULE_KEY);
    const order = await this.orderModel
      .findOne({
        _id: orderId,
        qrTokenId: token,
        tableId: context.table._id.toString(),
        locationId: this.stringifyId(context.location._id),
        tenantId: context.location.tenantId,
        tenantResolutionStatus: {
          $ne: OrderTenantResolutionStatus.LegacyOrphan,
        },
      })
      .lean();

    if (!order) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    return {
      orderId: this.stringifyId(order._id),
      orderNumber: order.orderNumber,
      status: order.status,
      itemStatuses: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        status: item.status,
      })),
      total: order.total,
      updatedAt: (order as Order & { updatedAt?: Date }).updatedAt,
    };
  }

  private async validateToken(token: string): Promise<ValidatedQrContext> {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
      throw new NotFoundException('QR-Code ist ungueltig');
    }

    const table = await this.tableModel.findOne({ qrToken: token }).exec();
    if (
      !table ||
      !table.qrEnabled ||
      table.qrTokenRevokedAt ||
      !table.isActive
    ) {
      throw new NotFoundException('QR-Code ist nicht aktiv');
    }

    const location = await this.locationModel.findById(table.locationId).lean();
    if (!location || location.isActive === false) {
      throw new NotFoundException('Standort ist nicht aktiv');
    }

    const company = location.companyId
      ? await this.companyModel.findById(location.companyId).lean()
      : undefined;
    if (company && company.isActive === false) {
      throw new NotFoundException('Unternehmen ist nicht aktiv');
    }

    return {
      table,
      location: location as Location & { _id: unknown },
      company: company as (Company & { _id: unknown }) | undefined,
    };
  }

  private async assertPublicModuleEnabled(
    context: ValidatedQrContext,
    moduleKey: string,
  ): Promise<void> {
    if (!context.location.tenantId) {
      throw new ForbiddenException('Kein Tenant-Kontext fuer QR-Bestellungen');
    }

    await this.modulesService.assertEnabledForTenant(
      moduleKey,
      context.location.tenantId,
    );
  }

  private async syncTableForQrOrder(
    table: RestaurantTableDocument,
    order: OrderDocument,
  ): Promise<void> {
    const activeOrderIds = [
      ...new Set([...(table.activeOrderIds ?? []), order._id.toString()]),
    ];
    const updatedTable = await this.tableModel
      .findByIdAndUpdate(
        table._id,
        {
          status: TableStatus.Ordering,
          activeOrderIds,
          currentTotal: this.roundMoney(
            (table.currentTotal ?? 0) + order.total,
          ),
          guestCount: Math.max(table.guestCount ?? 0, 1),
          waitingSince: table.waitingSince ?? new Date(),
          lastStatusChange: new Date(),
        },
        { new: true },
      )
      .exec();

    if (updatedTable) {
      this.realtimeService.publish('table.status.changed', {
        tableId: updatedTable._id.toString(),
        tableName: updatedTable.tableName ?? updatedTable.name,
        locationId: updatedTable.locationId,
        status: updatedTable.status,
        activeOrderIds: updatedTable.activeOrderIds,
        currentTotal: updatedTable.currentTotal,
        channels: this.eventChannels(
          updatedTable.companyId,
          updatedTable.locationId,
        ),
      });
    }
  }

  private async nextOrderNumber(locationId: string): Promise<string> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const count = await this.orderModel.countDocuments({
      locationId,
      tenantResolutionStatus: {
        $ne: OrderTenantResolutionStatus.LegacyOrphan,
      },
      createdAt: { $gte: start, $lt: end },
    });

    return `QR${String(count + 1).padStart(4, '0')}`;
  }

  private cleanText(value?: string): string | undefined {
    const text = value?.trim().replace(/\s+/g, ' ');
    return text || undefined;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
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

  private eventChannels(
    companyId: string | undefined,
    locationId: string,
  ): string[] {
    return [
      ...(companyId ? [`company:${companyId}`] : []),
      `location:${locationId}`,
      `service:${locationId}`,
      `kitchen:${locationId}`,
    ];
  }
}
