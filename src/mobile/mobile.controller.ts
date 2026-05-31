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
import {
  CreateMobileOrderDto,
  UpdateMobileOrderDto,
} from './dto/mobile-order.dto';
import { MobileQueryDto } from './dto/mobile-query.dto';
import { UpdateMobileTaskDto } from './dto/update-mobile-task.dto';
import { MobileService } from './mobile.service';

const MOBILE_ROLES = [
  Role.SuperAdmin,
  Role.Admin,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.Service,
  Role.Bar,
  Role.Theke,
  Role.Kueche,
];

@Controller('mobile')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...MOBILE_ROLES)
export class MobileController {
  constructor(private readonly mobileService: MobileService) {}

  @Get('dashboard')
  @Permissions('dashboard.view')
  dashboard(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MobileQueryDto,
  ) {
    return this.mobileService.dashboard(actor, query);
  }

  @Get('locations')
  @Permissions('locations.view')
  locations(@CurrentUser() actor: AuthenticatedUser) {
    return this.mobileService.locations(actor);
  }

  @Get('tables')
  @Permissions('locations.view')
  tables(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MobileQueryDto,
  ) {
    return this.mobileService.tables(actor, query);
  }

  @Get('orders')
  @Permissions('orders.view')
  orders(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MobileQueryDto,
  ) {
    return this.mobileService.orders(actor, query);
  }

  @Post('orders')
  @Permissions('orders.create')
  createOrder(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() payload: CreateMobileOrderDto,
  ) {
    return this.mobileService.createOrder(actor, payload);
  }

  @Patch('orders/:id')
  @Permissions('orders.update')
  updateOrder(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() payload: UpdateMobileOrderDto,
  ) {
    return this.mobileService.updateOrder(actor, id, payload);
  }

  @Get('tasks')
  @Permissions('tasks.view')
  tasks(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MobileQueryDto,
  ) {
    return this.mobileService.tasks(actor, query);
  }

  @Patch('tasks/:checklistId/:taskId')
  @Permissions('tasks.update')
  updateTask(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('checklistId') checklistId: string,
    @Param('taskId') taskId: string,
    @Body() payload: UpdateMobileTaskDto,
  ) {
    return this.mobileService.updateTask(actor, checklistId, taskId, payload);
  }

  @Get('reservations')
  @Permissions('reservations.view')
  reservations(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MobileQueryDto,
  ) {
    return this.mobileService.reservations(actor, query);
  }

  @Get('notifications')
  @Permissions('dashboard.view')
  notifications(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: MobileQueryDto,
  ) {
    return this.mobileService.notifications(actor, query);
  }

  @Get('menu')
  @Permissions('menuItems.view')
  menu(@CurrentUser() actor: AuthenticatedUser) {
    return this.mobileService.menu(actor);
  }
}
