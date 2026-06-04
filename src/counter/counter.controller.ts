import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { COUNTER_ORDERS_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import { OrderStatus, PaymentStatus } from '../orders/schemas/order.schema';
import { CancelCounterOrderDto } from './dto/cancel-counter-order.dto';
import { CreateCounterOrderDto } from './dto/create-counter-order.dto';
import { PayCounterOrderDto } from './dto/pay-counter-order.dto';
import { UpdateCounterSettingsDto } from './dto/update-counter-settings.dto';
import { UpdateCounterStatusDto } from './dto/update-counter-status.dto';
import { CounterOrderService } from './counter-order.service';

const COUNTER_VIEW_ROLES = [
  Role.PlatformAdmin,
  Role.SuperAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.Service,
  Role.Kueche,
  Role.Bar,
  Role.Theke,
];

const COUNTER_WRITE_ROLES = [
  Role.PlatformAdmin,
  Role.SuperAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.Service,
  Role.Theke,
];

@Controller('counter')
@RequireModule(COUNTER_ORDERS_MODULE_KEY)
@UseGuards(JwtAuthGuard, ModuleEnabledGuard, RolesGuard, PermissionsGuard)
export class CounterController {
  constructor(private readonly counterService: CounterOrderService) {}

  @Get('dashboard')
  @Roles(...COUNTER_VIEW_ROLES)
  @Permissions('counter.orders.view')
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.counterService.dashboard(user, locationId);
  }

  @Get('reports/summary')
  @Roles(...COUNTER_VIEW_ROLES, Role.Buchhaltung)
  @Permissions('counter.reports.view')
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.counterService.report(user, { locationId, from, to });
  }

  @Get('reports/export')
  @Roles(...COUNTER_VIEW_ROLES, Role.Buchhaltung)
  @Permissions('counter.reports.export')
  exportReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.counterService.reportCsv(user, { locationId, from, to });
  }

  @Get('orders')
  @Roles(...COUNTER_VIEW_ROLES)
  @Permissions('counter.orders.view')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('status') status?: OrderStatus,
    @Query('paymentStatus') paymentStatus?: PaymentStatus,
    @Query('date') date?: string,
    @Query('q') q?: string,
  ) {
    return this.counterService.findAll(user, {
      locationId,
      status,
      paymentStatus,
      date,
      q,
    });
  }

  @Get('orders/:id')
  @Roles(...COUNTER_VIEW_ROLES)
  @Permissions('counter.orders.view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.counterService.findOne(id, user);
  }

  @Get('orders/:id/history')
  @Roles(...COUNTER_VIEW_ROLES)
  @Permissions('counter.orders.view')
  history(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.counterService.history(id, user);
  }

  @Post('orders')
  @Roles(...COUNTER_WRITE_ROLES)
  @Permissions('counter.orders.create')
  create(
    @Body() dto: CreateCounterOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.counterService.create(dto, user);
  }

  @Patch('orders/:id/status')
  @Roles(...COUNTER_VIEW_ROLES)
  @Permissions('counter.orders.update')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCounterStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.counterService.updateStatus(id, dto, user);
  }

  @Post('orders/:id/call')
  @Roles(...COUNTER_VIEW_ROLES)
  @Permissions('counter.orders.update')
  call(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.counterService.call(id, user);
  }

  @Post('orders/:id/pay')
  @Roles(...COUNTER_WRITE_ROLES)
  @Permissions('counter.orders.pay')
  pay(
    @Param('id') id: string,
    @Body() dto: PayCounterOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.counterService.pay(id, dto, user);
  }

  @Post('orders/:id/complete')
  @Roles(...COUNTER_WRITE_ROLES)
  @Permissions('counter.orders.complete')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.counterService.complete(id, user);
  }

  @Post('orders/:id/cancel')
  @Roles(...COUNTER_WRITE_ROLES)
  @Permissions('counter.orders.cancel')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelCounterOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.counterService.cancel(id, dto, user);
  }

  @Get('pickup-display')
  @Roles(...COUNTER_VIEW_ROLES)
  @Permissions('counter.pickupDisplay.view')
  pickupDisplay(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.counterService.pickupDisplay(user, locationId);
  }

  @Get('settings')
  @Roles(...COUNTER_VIEW_ROLES)
  @Permissions('counter.settings.view')
  getSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId: string,
  ) {
    return this.counterService.getSettings(locationId, user);
  }

  @Patch('settings')
  @Roles(
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
  )
  @Permissions('counter.settings.update')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId: string,
    @Body() dto: UpdateCounterSettingsDto,
  ) {
    return this.counterService.updateSettings(locationId, dto, user);
  }
}
