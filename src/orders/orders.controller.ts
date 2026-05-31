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
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Permissions('orders.create')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin, Role.Regionalleiter, Role.Filialleiter, Role.Service, Role.Theke)
  create(@Body() createOrderDto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.create(createOrderDto, user);
  }

  @Get()
  @Permissions('orders.view')
  @Roles(
    Role.Admin,
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.Regionalleiter,
    Role.Filialleiter,
    Role.Service,
    Role.Kueche,
    Role.Bar,
    Role.Theke,
  )
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('tableId') tableId?: string,
    @Query('status') status?: string,
  ) {
    return this.ordersService.findAll(user, { locationId, tableId, status });
  }

  @Get(':id')
  @Permissions('orders.view')
  @Roles(
    Role.Admin,
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.Regionalleiter,
    Role.Filialleiter,
    Role.Service,
    Role.Kueche,
    Role.Bar,
    Role.Theke,
  )
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('orders.update')
  @Roles(
    Role.Admin,
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.Regionalleiter,
    Role.Filialleiter,
    Role.Service,
    Role.Kueche,
    Role.Bar,
    Role.Theke,
  )
  update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.update(id, updateOrderDto, user);
  }

  @Delete(':id')
  @Permissions('orders.cancel')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin, Role.Regionalleiter, Role.Filialleiter)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.ordersService.remove(id, user);
  }
}
