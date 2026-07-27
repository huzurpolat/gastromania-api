import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { REPORTING_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import { BenchmarkingQueryDto } from './dto/benchmarking-query.dto';
import { ExecutiveDashboardService } from './executive-dashboard.service';

const EXECUTIVE_DASHBOARD_ROLES = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Personalabteilung,
  Role.Buchhaltung,
];

@Controller('reports/executive-dashboard')
@RequireModule(REPORTING_MODULE_KEY)
@UseGuards(JwtAuthGuard, ModuleEnabledGuard, RolesGuard, PermissionsGuard)
@Roles(...EXECUTIVE_DASHBOARD_ROLES)
@Permissions('reports.view')
export class ExecutiveDashboardController {
  constructor(
    private readonly executiveDashboardService: ExecutiveDashboardService,
  ) {}

  @Get()
  getExecutiveDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BenchmarkingQueryDto,
  ): Promise<unknown> {
    return this.executiveDashboardService.getExecutiveDashboard(user, query);
  }
}
