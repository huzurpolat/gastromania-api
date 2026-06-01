import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { RecipeInventoryService } from '../recipes/recipe-inventory.service';
import { RealtimeService } from '../realtime/realtime.service';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableStatus,
} from '../tables/schemas/table.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import {
  CourseType,
  Order,
  OrderDocument,
  OrderItem,
  OrderItemStatus,
  OrderStatus,
  PaymentStatus,
  ProductionArea,
} from './schemas/order.schema';

export interface OrderFilters {
  locationId?: string;
  tableId?: string;
  status?: string;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    private readonly realtimeService: RealtimeService,
    private readonly recipeInventoryService: RecipeInventoryService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    createOrderDto: CreateOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    this.validateObjectId(createOrderDto.locationId, 'Standort-ID');
    await this.accessPolicy.assertCanAccessLocation(actor, createOrderDto.locationId);
    if (createOrderDto.tableId) {
      this.validateObjectId(createOrderDto.tableId, 'Tisch-ID');
    }

    const status = createOrderDto.status ?? OrderStatus.New;
    const totals = this.calculateTotals(createOrderDto.items);
    const order = await this.orderModel.create({
      ...createOrderDto,
      companyId: actor.companyId,
      createdBy: actor.sub,
      employeeId: createOrderDto.employeeId ?? actor.sub,
      assignedWaiterId: createOrderDto.assignedWaiterId ?? actor.sub,
      guestCount: createOrderDto.guestCount ?? 1,
      orderNumber: await this.nextOrderNumber(createOrderDto.locationId),
      pickupNumber:
        createOrderDto.tableId || createOrderDto.customerNumber
          ? createOrderDto.customerNumber
          : await this.nextPickupNumber(createOrderDto.locationId),
      status,
      statusTimestamps: {
        [status]: new Date(),
      },
      items: createOrderDto.items.map((item) => ({
        ...item,
        totalPrice: this.calculateItemTotal(item),
        status: item.status ?? OrderItemStatus.Open,
        productionArea:
          item.productionArea ??
          (item.isKitchenItem === false
            ? ProductionArea.Bar
            : ProductionArea.Kitchen),
        courseType: item.courseType ?? CourseType.Main,
        specialRequests: item.specialRequests ?? [],
        allergens: item.allergens ?? [],
      })),
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
    });

    try {
      await this.recipeInventoryService.consumeOrder(
        order,
        createOrderDto.employeeId ?? 'system',
      );
    } catch (error) {
      await order.deleteOne();
      throw error;
    }

    this.realtimeService.publish('order.created', order);
    await this.syncTableStatus(order);

    return order;
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: OrderFilters = {},
  ): Promise<OrderDocument[]> {
    const query = await this.accessPolicy.getScopedResourceFilter(
      actor,
      filters.locationId,
    );

    if (filters.locationId) {
      this.validateObjectId(filters.locationId, 'Standort-ID');
    }

    if (filters.tableId) {
      this.validateObjectId(filters.tableId, 'Tisch-ID');
      query.tableId = filters.tableId;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    return this.orderModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string, actor?: AuthenticatedUser): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');

    const order = await this.orderModel.findById(id).exec();

    if (
      !order ||
      (actor && !(await this.accessPolicy.canAccessLocation(actor, order.locationId)))
    ) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    return order;
  }

  async update(
    id: string,
    updateOrderDto: UpdateOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');
    const currentOrder = await this.findOne(id, actor);
    await this.accessPolicy.assertCanAccessLocation(actor, currentOrder.locationId);

    if (updateOrderDto.locationId) {
      this.validateObjectId(updateOrderDto.locationId, 'Standort-ID');
      await this.accessPolicy.assertCanAccessLocation(actor, updateOrderDto.locationId);
    }

    if (updateOrderDto.tableId) {
      this.validateObjectId(updateOrderDto.tableId, 'Tisch-ID');
    }

    const totals = updateOrderDto.items
      ? this.calculateTotals(updateOrderDto.items)
      : undefined;
    const updatePayload = {
      ...updateOrderDto,
      ...(updateOrderDto.items
        ? {
            items: updateOrderDto.items.map((item) => ({
              ...item,
              totalPrice: this.calculateItemTotal(item),
              status: item.status ?? OrderItemStatus.Open,
              productionArea:
                item.productionArea ??
                (item.isKitchenItem === false
                  ? ProductionArea.Bar
                  : ProductionArea.Kitchen),
              courseType: item.courseType ?? CourseType.Main,
              specialRequests: item.specialRequests ?? [],
              allergens: item.allergens ?? [],
            })),
            subtotal: totals?.subtotal,
            tax: totals?.tax,
            total: totals?.total,
          }
        : {}),
    };

    const statusChanged =
      updateOrderDto.status && updateOrderDto.status !== currentOrder.status;
    const statusTimestamps = statusChanged
      ? {
          ...(currentOrder.statusTimestamps ?? {}),
          [updateOrderDto.status as string]: new Date(),
        }
      : currentOrder.statusTimestamps;

    const updatedOrder = await this.orderModel
      .findByIdAndUpdate(
        id,
        { ...updatePayload, statusTimestamps },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!updatedOrder) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    this.realtimeService.publish(
      statusChanged ? 'order.statusChanged' : 'order.updated',
      updatedOrder,
    );
    await this.syncTableStatus(updatedOrder);

    return updatedOrder;
  }

  async sendToKitchen(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    return this.update(id, { status: OrderStatus.Accepted }, actor);
  }

  async markPaid(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    return this.update(
      id,
      { paymentStatus: PaymentStatus.Paid, status: OrderStatus.Closed },
      actor,
    );
  }

  async close(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    return this.update(id, { status: OrderStatus.Closed }, actor);
  }

  async releaseTable(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    const order = await this.findOne(id, actor);

    if (!order.tableId) {
      throw new BadRequestException('Bestellung ist keinem Tisch zugeordnet');
    }

    const released = await this.update(
      id,
      { paymentStatus: PaymentStatus.Paid, status: OrderStatus.Closed },
      actor,
    );

    await this.tableModel
      .findByIdAndUpdate(order.tableId, { status: TableStatus.Free }, { new: true })
      .exec();
    this.realtimeService.publish('table.released', {
      tableId: order.tableId,
      orderId: order._id.toString(),
    });

    return released;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');
    const order = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(actor, order.locationId);

    const deletedOrder = await this.orderModel.findByIdAndDelete(id).exec();

    if (!deletedOrder) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    this.realtimeService.publish('order.cancelled', deletedOrder);
    await this.syncTableStatus(deletedOrder, true);

    return deletedOrder;
  }

  private calculateTotals(
    items: Pick<OrderItem, 'quantity' | 'price'>[],
  ): { subtotal: number; tax: number; total: number } {
    const subtotal = items.reduce(
      (sum, item) => sum + this.calculateItemTotal(item),
      0,
    );
    const tax = this.roundMoney(subtotal * 0.19);

    return {
      subtotal: this.roundMoney(subtotal),
      tax,
      total: this.roundMoney(subtotal),
    };
  }

  private calculateItemTotal(
    item: Pick<OrderItem, 'quantity' | 'price'>,
  ): number {
    return this.roundMoney(item.quantity * item.price);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private async syncTableStatus(
    order: Pick<OrderDocument, 'tableId' | 'status' | 'paymentStatus'>,
    removed = false,
  ): Promise<void> {
    if (!order.tableId) {
      return;
    }

    const status = removed
      ? TableStatus.Free
      : this.getTableStatusForOrder(order.status, order.paymentStatus);

    await this.tableModel
      .findByIdAndUpdate(order.tableId, { status }, { new: true })
      .exec();
    this.realtimeService.publish('table.statusChanged', {
      tableId: order.tableId,
      status,
    });
  }

  private getTableStatusForOrder(
    status: OrderStatus,
    paymentStatus?: PaymentStatus,
  ): TableStatus {
    if (paymentStatus === PaymentStatus.Paid) {
      return TableStatus.Paid;
    }

    switch (status) {
      case OrderStatus.Draft:
      case OrderStatus.New:
        return TableStatus.Ordering;
      case OrderStatus.Accepted:
      case OrderStatus.Preparing:
      case OrderStatus.Ready:
        return TableStatus.InProgress;
      case OrderStatus.Served:
        return TableStatus.ReadyToPay;
      case OrderStatus.Closed:
        return TableStatus.Paid;
      case OrderStatus.Cancelled:
        return TableStatus.Free;
    }
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private async nextOrderNumber(locationId: string): Promise<string> {
    const sequence = await this.countToday(locationId);

    return `B${String(sequence + 1).padStart(4, '0')}`;
  }

  private async nextPickupNumber(locationId: string): Promise<string> {
    const sequence = await this.countToday(locationId);

    return `A${String(sequence + 1).padStart(3, '0')}`;
  }

  private async countToday(locationId: string): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    return this.orderModel
      .countDocuments({
        locationId,
        createdAt: {
          $gte: start,
          $lt: end,
        },
      })
      .exec();
  }
}
