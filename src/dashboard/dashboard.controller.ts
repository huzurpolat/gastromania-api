import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { RealtimeService } from '../realtime/realtime.service';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { UpdateDashboardPreferencesDto } from './dto/update-dashboard-preferences.dto';

const DASHBOARD_ROLES = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
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
  Role.Lager,
  Role.Einkauf,
  Role.Buchhaltung,
  Role.Marketing,
  Role.Personalabteilung,
];

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...DASHBOARD_ROLES)
@Permissions('dashboard.view')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Get('overview')
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.overview(user, query);
  }

  @Get('sales')
  sales(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.sales(user, query);
  }

  @Get('orders')
  orders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.orders(user, query);
  }

  @Get('inventory')
  inventory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.inventory(user, query);
  }

  @Get('reservations')
  reservations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.reservations(user, query);
  }

  @Get('employees')
  employees(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.employees(user, query);
  }

  @Get('finance')
  finance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.finance(user, query);
  }

  @Get('notifications')
  notifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.notifications(user, query);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: UpdateDashboardPreferencesDto,
  ) {
    return this.dashboardService.updatePreferences(user, payload);
  }

  @Get('export')
  @Permissions('reports.export')
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.export(user, query);
  }

  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.realtimeService.stream();
  }
}
