import {
  Body,
  Controller,
  Delete,
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
import { TABLE_ORDERS_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderItemStatusDto } from './dto/update-order-item-status.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

const ORDER_VIEW_ROLES = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.LocationManager,
  Role.Waiter,
  Role.Service,
  Role.Kitchen,
  Role.Kueche,
  Role.Bar,
  Role.Counter,
  Role.Theke,
];

const ORDER_WRITE_ROLES = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.LocationManager,
  Role.Waiter,
  Role.Service,
  Role.Counter,
  Role.Theke,
];

const ORDER_ITEM_STATUS_ROLES = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.LocationManager,
  Role.Schichtleiter,
  Role.Waiter,
  Role.Service,
  Role.Kitchen,
  Role.Kueche,
  Role.Bar,
  Role.Counter,
  Role.Theke,
];

const ORDER_MANAGE_ROLES = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.LocationManager,
];

@Controller('orders')
@RequireModule(TABLE_ORDERS_MODULE_KEY)
@UseGuards(JwtAuthGuard, ModuleEnabledGuard, RolesGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Permissions('orders.create')
  @Roles(...ORDER_WRITE_ROLES)
  create(
    @Body() createOrderDto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.create(createOrderDto, user);
  }

  @Get()
  @Permissions('orders.view')
  @Roles(...ORDER_VIEW_ROLES)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('tableId') tableId?: string,
    @Query('status') status?: string,
  ) {
    return this.ordersService.findAll(user, { locationId, tableId, status });
  }

  @Get('today')
  @Permissions('orders.view')
  @Roles(...ORDER_VIEW_ROLES)
  findToday(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.ordersService.findToday(user, locationId);
  }

  @Get('location/:locationId')
  @Permissions('orders.view')
  @Roles(...ORDER_VIEW_ROLES)
  findByLocation(
    @Param('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.findByLocation(user, locationId);
  }

  @Get(':id')
  @Permissions('orders.view')
  @Roles(...ORDER_VIEW_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('orders.update')
  @Roles(...ORDER_ITEM_STATUS_ROLES)
  update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.update(id, updateOrderDto, user);
  }

  @Patch(':orderId/items/:itemId/status')
  @Permissions('orders.update')
  @Roles(...ORDER_ITEM_STATUS_ROLES)
  updateItemStatus(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.updateItemStatus(orderId, itemId, dto, user);
  }

  @Post(':id/send-to-kitchen')
  @Permissions('orders.update')
  @Roles(...ORDER_WRITE_ROLES)
  sendToKitchen(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.sendToKitchen(id, user);
  }

  @Post(':id/mark-paid')
  @Permissions('orders.update')
  @Roles(...ORDER_WRITE_ROLES)
  markPaid(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.markPaid(id, user);
  }

  @Post(':id/close')
  @Permissions('orders.update')
  @Roles(...ORDER_WRITE_ROLES)
  close(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.close(id, user);
  }

  @Post(':id/release-table')
  @Permissions('orders.update')
  @Roles(...ORDER_WRITE_ROLES)
  releaseTable(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.releaseTable(id, user);
  }

  @Delete(':id')
  @Permissions('orders.cancel')
  @Roles(...ORDER_MANAGE_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.remove(id, user);
  }
}
