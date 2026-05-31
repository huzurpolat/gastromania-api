import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { ProductionArea } from '../orders/schemas/order.schema';
import { RealtimeService } from '../realtime/realtime.service';
import {
  KdsActionDto,
  UpdateOrderItemStatusDto,
  UpdateOrderStatusDto,
} from './dto/kds-status.dto';
import { UpdateKdsSettingsDto } from './dto/update-kds-settings.dto';
import { KdsService } from './kds.service';

const KDS_ROLES = [
  Role.Admin,
  Role.Filialleiter,
  Role.Kueche,
  Role.Bar,
  Role.Theke,
  Role.Service,
];

@Controller('kds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...KDS_ROLES)
export class KdsController {
  constructor(
    private readonly kdsService: KdsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Get('orders')
  findOrders(
    @Query('locationId') locationId?: string,
    @Query('area') area?: ProductionArea | 'Alle',
  ) {
    return this.kdsService.findOrders({ locationId, area });
  }

  @Get('orders/active')
  findActive(
    @Query('locationId') locationId?: string,
    @Query('area') area?: ProductionArea | 'Alle',
  ) {
    return this.kdsService.findActive({ locationId, area });
  }

  @Get('orders/:id')
  findOne(@Param('id') id: string) {
    return this.kdsService.findOne(id);
  }

  @Patch('orders/:id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.updateStatus(id, dto, user);
  }

  @Patch('orders/:id/items/:itemId/status')
  updateItemStatus(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.updateItemStatus(id, itemId, dto, user);
  }

  @Post('orders/:id/call')
  callOrder(
    @Param('id') id: string,
    @Body() dto: KdsActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.callOrder(id, dto, user);
  }

  @Post('orders/:id/complete')
  completeOrder(
    @Param('id') id: string,
    @Body() dto: KdsActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.completeOrder(id, dto, user);
  }

  @Post('orders/:id/cancel')
  cancelOrder(
    @Param('id') id: string,
    @Body() dto: KdsActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.cancelOrder(id, dto, user);
  }

  @Get('settings')
  getSettings(@Query('locationId') locationId: string) {
    return this.kdsService.getSettings(locationId);
  }

  @Patch('settings')
  @Roles(Role.Admin, Role.Filialleiter)
  updateSettings(
    @Query('locationId') locationId: string,
    @Body() dto: UpdateKdsSettingsDto,
  ) {
    return this.kdsService.updateSettings(locationId, dto);
  }

  @Get('history')
  findHistory(
    @Query('locationId') locationId?: string,
    @Query('orderId') orderId?: string,
  ) {
    return this.kdsService.findHistory({ locationId, orderId });
  }

  @Get('pickup-display')
  pickupDisplay(@Query('locationId') locationId?: string) {
    return this.kdsService.pickupDisplay(locationId);
  }

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.realtimeService.stream();
  }
}
