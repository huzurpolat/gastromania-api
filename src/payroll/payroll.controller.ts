import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { PAYROLL_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import {
  LockPayrollPeriodDto,
  PayrollExportQueryDto,
  PayrollQueryDto,
} from './dto/payroll-query.dto';
import { PayrollService } from './payroll.service';

const payrollRoles = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
  Role.CompanyAdmin,
  Role.RestaurantAdmin,
  Role.Admin,
  Role.Personalabteilung,
  Role.Buchhaltung,
];

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@Roles(...payrollRoles)
@RequireModule(PAYROLL_MODULE_KEY)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('summary')
  @Permissions('payroll.view')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollQueryDto,
  ) {
    return this.payrollService.summary(user, query);
  }

  @Get('periods')
  @Permissions('payroll.view')
  periods(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollQueryDto,
  ) {
    return this.payrollService.listPeriods(user, query);
  }

  @Post('periods/lock')
  @Permissions('payroll.lock')
  lockPeriod(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: LockPayrollPeriodDto,
  ) {
    return this.payrollService.lockPeriod(user, payload);
  }

  @Get('export')
  @Permissions('payroll.export')
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PayrollExportQueryDto,
  ) {
    return this.payrollService.export(user, query);
  }
}
