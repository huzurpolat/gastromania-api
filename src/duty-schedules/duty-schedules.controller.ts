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
import { STAFF_MANAGEMENT_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import { CreateDutyShiftDto } from './dto/create-duty-shift.dto';
import { UpdateDutyShiftDto } from './dto/update-duty-shift.dto';
import { DutySchedulesService } from './duty-schedules.service';

const dutyScheduleManagerRoles = [
  Role.TenantAdminCode,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.Personalabteilung,
];

const dutyScheduleReaderRoles = [
  ...dutyScheduleManagerRoles,
  Role.Service,
  Role.Kueche,
  Role.Bar,
  Role.Theke,
  Role.Lager,
  Role.Reinigung,
  Role.Tellerwaescher,
];

@Controller('duty-schedules')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule(STAFF_MANAGEMENT_MODULE_KEY)
export class DutySchedulesController {
  constructor(private readonly dutySchedulesService: DutySchedulesService) {}

  @Post()
  @Permissions('employees.create')
  @Roles(...dutyScheduleManagerRoles)
  create(
    @Body() createDutyShiftDto: CreateDutyShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dutySchedulesService.create(createDutyShiftDto, user);
  }

  @Get()
  @Permissions('employees.view')
  @Roles(...dutyScheduleReaderRoles)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.dutySchedulesService.findAll(user, { locationId, start, end });
  }

  @Patch(':id')
  @Permissions('employees.update')
  @Roles(...dutyScheduleManagerRoles)
  update(
    @Param('id') id: string,
    @Body() updateDutyShiftDto: UpdateDutyShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dutySchedulesService.update(id, updateDutyShiftDto, user);
  }

  @Delete(':id')
  @Permissions('employees.delete')
  @Roles(...dutyScheduleManagerRoles)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.dutySchedulesService.remove(id, user);
  }
}
