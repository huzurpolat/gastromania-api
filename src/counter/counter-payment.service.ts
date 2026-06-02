import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Order,
  OrderDocument,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../orders/schemas/order.schema';
import { RealtimeService } from '../realtime/realtime.service';
import { PayCounterOrderDto } from './dto/pay-counter-order.dto';
import {
  CounterPayment,
  CounterPaymentDocument,
} from './schemas/counter-payment.schema';

@Injectable()
export class CounterPaymentService {
  constructor(
    @InjectModel(CounterPayment.name)
    private readonly paymentModel: Model<CounterPaymentDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly realtimeService: RealtimeService,
  ) {}

  async pay(
    order: OrderDocument,
    dto: PayCounterOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderDocument> {
    if (order.status === OrderStatus.Cancelled) {
      throw new BadRequestException('Stornierte Bestellung kann nicht bezahlt werden');
    }

    const alreadyPaid = this.paidAmount(order);
    const amount = this.roundMoney(dto.amount ?? Math.max(order.total - alreadyPaid, 0));

    if (amount <= 0) {
      throw new BadRequestException('Zahlbetrag muss groesser als 0 sein');
    }

    await this.paymentModel.create({
      companyId: order.companyId ?? actor.companyId,
      locationId: order.locationId,
      orderId: order._id.toString(),
      pickupNumber: order.pickupNumber,
      amount,
      method: dto.method,
      status: PaymentStatus.Paid,
      cashierId: actor.sub,
      paidAt: new Date(),
      note: dto.note,
    });

    this.applyPaymentAmount(order, dto.method, amount);
    const nextPaid = this.paidAmount(order);
    order.paymentStatus =
      nextPaid >= order.total ? PaymentStatus.Paid : PaymentStatus.PartiallyPaid;
    order.paymentMethod = this.resolvePaymentMethod(order, dto.method);
    order.paidAt = order.paymentStatus === PaymentStatus.Paid ? new Date() : order.paidAt;
    order.paidBy = actor.sub;

    const saved = await this.orderModel
      .findByIdAndUpdate(order._id, order.toObject(), {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!saved) {
      throw new BadRequestException('Zahlung konnte nicht gespeichert werden');
    }

    this.realtimeService.publish('counter.order.paid', this.eventPayload(saved, actor));
    this.realtimeService.publish('order.payment.changed', this.eventPayload(saved, actor));

    return saved;
  }

  private paidAmount(order: OrderDocument): number {
    return this.roundMoney(
      (order.cashAmount ?? 0) +
        (order.cardAmount ?? 0) +
        (order.onlineAmount ?? 0) +
        (order.voucherAmount ?? 0) +
        (order.otherAmount ?? 0),
    );
  }

  private applyPaymentAmount(
    order: OrderDocument,
    method: PaymentMethod,
    amount: number,
  ): void {
    if (method === PaymentMethod.Cash) order.cashAmount = this.roundMoney((order.cashAmount ?? 0) + amount);
    else if (method === PaymentMethod.Card) order.cardAmount = this.roundMoney((order.cardAmount ?? 0) + amount);
    else if (method === PaymentMethod.Online || method === PaymentMethod.Paypal) order.onlineAmount = this.roundMoney((order.onlineAmount ?? 0) + amount);
    else if (method === PaymentMethod.Voucher) order.voucherAmount = this.roundMoney((order.voucherAmount ?? 0) + amount);
    else order.otherAmount = this.roundMoney((order.otherAmount ?? 0) + amount);
  }

  private resolvePaymentMethod(
    order: OrderDocument,
    latestMethod: PaymentMethod,
  ): PaymentMethod {
    const usedMethods = [
      order.cashAmount ? PaymentMethod.Cash : undefined,
      order.cardAmount ? PaymentMethod.Card : undefined,
      order.onlineAmount ? PaymentMethod.Online : undefined,
      order.voucherAmount ? PaymentMethod.Voucher : undefined,
      order.otherAmount ? PaymentMethod.Other : undefined,
    ].filter(Boolean);

    return usedMethods.length > 1 ? PaymentMethod.Mixed : latestMethod;
  }

  private eventPayload(order: OrderDocument, actor: AuthenticatedUser) {
    return {
      order,
      orderId: order._id.toString(),
      pickupNumber: order.pickupNumber,
      locationId: order.locationId,
      companyId: order.companyId ?? actor.companyId,
      changedBy: actor.sub,
      channels: this.channels(order.companyId ?? actor.companyId, order.locationId),
    };
  }

  private channels(companyId: string | undefined, locationId: string): string[] {
    return [
      ...(companyId ? [`company:${companyId}`] : []),
      `location:${locationId}`,
      `counter:${locationId}`,
      `kitchen:${locationId}`,
      `service:${locationId}`,
    ];
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
