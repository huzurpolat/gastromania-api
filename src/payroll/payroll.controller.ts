import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { PayrollQuery, PayrollService } from './payroll.service';

const payrollRoles = [
  Role.PlatformAdmin,
  Role.SuperAdmin,
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

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...payrollRoles)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('summary')
  @Permissions('payroll.view')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const query: PayrollQuery = { locationId, employeeId, start, end };
    return this.payrollService.summary(user, query);
  }

  @Get('export')
  @Permissions('payroll.export')
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('format') format?: 'csv' | 'xlsx',
  ) {
    return this.payrollService.export(user, {
      locationId,
      employeeId,
      start,
      end,
      format,
    });
  }
}
