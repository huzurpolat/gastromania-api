import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { Order, OrderDocument, OrderItem } from './schemas/order.schema';

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
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<OrderDocument> {
    this.validateObjectId(createOrderDto.locationId, 'Standort-ID');
    this.validateObjectId(createOrderDto.tableId, 'Tisch-ID');

    return this.orderModel.create({
      ...createOrderDto,
      total: this.calculateTotal(createOrderDto.items),
    });
  }

  async findAll(filters: OrderFilters = {}): Promise<OrderDocument[]> {
    const query: OrderFilters = {};

    if (filters.locationId) {
      this.validateObjectId(filters.locationId, 'Standort-ID');
      query.locationId = filters.locationId;
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

  async findOne(id: string): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');

    const order = await this.orderModel.findById(id).exec();

    if (!order) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    return order;
  }

  async update(
    id: string,
    updateOrderDto: UpdateOrderDto,
  ): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');

    if (updateOrderDto.locationId) {
      this.validateObjectId(updateOrderDto.locationId, 'Standort-ID');
    }

    if (updateOrderDto.tableId) {
      this.validateObjectId(updateOrderDto.tableId, 'Tisch-ID');
    }

    const updatePayload = {
      ...updateOrderDto,
      ...(updateOrderDto.items
        ? { total: this.calculateTotal(updateOrderDto.items) }
        : {}),
    };

    const updatedOrder = await this.orderModel
      .findByIdAndUpdate(id, updatePayload, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updatedOrder) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    return updatedOrder;
  }

  async remove(id: string): Promise<OrderDocument> {
    this.validateObjectId(id, 'Bestell-ID');

    const deletedOrder = await this.orderModel.findByIdAndDelete(id).exec();

    if (!deletedOrder) {
      throw new NotFoundException('Bestellung nicht gefunden');
    }

    return deletedOrder;
  }

  private calculateTotal(
    items: Pick<OrderItem, 'quantity' | 'price'>[],
  ): number {
    return items.reduce((sum, item) => sum + item.quantity * item.price, 0);
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }
}
