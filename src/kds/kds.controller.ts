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
import { AccessPolicyService } from '../access/access-policy.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
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
  Role.PlatformAdmin,
  Role.SuperAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Kueche,
  Role.Bar,
  Role.Theke,
  Role.Service,
];

@Controller('kds')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...KDS_ROLES)
export class KdsController {
  constructor(
    private readonly kdsService: KdsService,
    private readonly realtimeService: RealtimeService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  @Get('orders')
  @Permissions('kds.view')
  findOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('area') area?: ProductionArea | 'Alle',
  ) {
    return this.kdsService.findOrders(user, { locationId, area });
  }

  @Get('orders/active')
  @Permissions('kds.view')
  findActive(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('area') area?: ProductionArea | 'Alle',
  ) {
    return this.kdsService.findActive(user, { locationId, area });
  }

  @Get('orders/:id')
  @Permissions('kds.view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.kdsService.findOne(id, user);
  }

  @Patch('orders/:id/status')
  @Permissions('kds.manage')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.updateStatus(id, dto, user);
  }

  @Patch('orders/:id/items/:itemId/status')
  @Permissions('kds.manage')
  updateItemStatus(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.updateItemStatus(id, itemId, dto, user);
  }

  @Post('orders/:id/call')
  @Permissions('kds.manage')
  callOrder(
    @Param('id') id: string,
    @Body() dto: KdsActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.callOrder(id, dto, user);
  }

  @Post('orders/:id/complete')
  @Permissions('kds.manage')
  completeOrder(
    @Param('id') id: string,
    @Body() dto: KdsActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.completeOrder(id, dto, user);
  }

  @Post('orders/:id/cancel')
  @Permissions('kds.manage')
  cancelOrder(
    @Param('id') id: string,
    @Body() dto: KdsActionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.cancelOrder(id, dto, user);
  }

  @Get('settings')
  @Permissions('kds.view')
  getSettings(
    @Query('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.getSettings(locationId, user);
  }

  @Patch('settings')
  @Permissions('kds.manage')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter)
  updateSettings(
    @Query('locationId') locationId: string,
    @Body() dto: UpdateKdsSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kdsService.updateSettings(locationId, dto, user);
  }

  @Get('history')
  @Permissions('kds.view')
  findHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('orderId') orderId?: string,
  ) {
    return this.kdsService.findHistory(user, { locationId, orderId });
  }

  @Get('pickup-display')
  @Permissions('kds.view')
  pickupDisplay(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.kdsService.pickupDisplay(user, locationId);
  }

  @Sse('events')
  @Permissions('kds.view')
  async events(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Observable<MessageEvent>> {
    if (this.accessPolicy.isPlatformAdmin(user)) {
      return this.realtimeService.stream();
    }

    const locationIds = await this.accessPolicy.getReadableLocationIds(user);

    return this.realtimeService.streamWhere((event) =>
      this.isEventInScope(event, locationIds),
    );
  }

  private isEventInScope(event: MessageEvent, locationIds: string[]): boolean {
    const data = event.data as {
      payload?: {
        locationId?: string;
        order?: { locationId?: string };
        settings?: { locationId?: string };
      };
    };
    const locationId =
      data.payload?.locationId ??
      data.payload?.order?.locationId ??
      data.payload?.settings?.locationId;

    return Boolean(locationId && locationIds.includes(locationId));
  }
}
