import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CreatePublicQrOrderDto } from './dto/public-qr-order.dto';
import { QrOrdersService } from './qr-orders.service';

@Controller('public/qr-order')
export class QrOrdersController {
  constructor(private readonly qrOrdersService: QrOrdersService) {}

  @Get(':token')
  getPublicMenu(@Param('token') token: string) {
    return this.qrOrdersService.getPublicMenu(token);
  }

  @Post(':token/orders')
  createOrder(
    @Param('token') token: string,
    @Body() dto: CreatePublicQrOrderDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.qrOrdersService.createOrder(token, dto, { userAgent });
  }

  @Get(':token/orders/:orderId/status')
  getOrderStatus(
    @Param('token') token: string,
    @Param('orderId') orderId: string,
  ) {
    return this.qrOrdersService.getOrderStatus(token, orderId);
  }
}
