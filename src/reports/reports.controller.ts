import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { COST_OF_GOODS_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import { MarginReportQueryDto } from './dto/margin-report-query.dto';
import { MarginReportsService } from './margin-reports.service';

const MARGIN_REPORT_ROLES = [
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
  Role.Einkauf,
  Role.Buchhaltung,
];

@Controller('reports/margins')
@RequireModule(COST_OF_GOODS_MODULE_KEY)
@UseGuards(JwtAuthGuard, ModuleEnabledGuard, RolesGuard, PermissionsGuard)
@Roles(...MARGIN_REPORT_ROLES)
@Permissions('reports.view')
export class ReportsController {
  constructor(private readonly marginReportsService: MarginReportsService) {}

  @Get()
  margins(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MarginReportQueryDto,
  ) {
    return this.marginReportsService.getMargins(user, query);
  }

  @Get('menu-items')
  menuItems(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MarginReportQueryDto,
  ) {
    return this.marginReportsService.getMenuItems(user, query);
  }

  @Get('locations')
  locations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MarginReportQueryDto,
  ) {
    return this.marginReportsService.getLocations(user, query);
  }

  @Get('quadrant')
  quadrant(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MarginReportQueryDto,
  ) {
    return this.marginReportsService.getQuadrant(user, query);
  }

  @Get('summary')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MarginReportQueryDto,
  ) {
    return this.marginReportsService.getSummary(user, query);
  }
}
