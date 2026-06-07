import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
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
import {
  CreateStaffShiftDto,
  UpdateStaffShiftDto,
} from './dto/staff-shift.dto';
import { StaffShiftStatus } from './schemas/staff-shift.schema';
import {
  StaffPlanningService,
  StaffShiftFilters,
} from './staff-planning.service';

const staffScheduleRoles = [
  Role.TenantAdminCode,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.LocationManager,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.Waiter,
  Role.Service,
  Role.Kitchen,
  Role.Kueche,
  Role.Counter,
  Role.Cashier,
  Role.InventoryManager,
  Role.Lager,
  Role.Dishwasher,
  Role.Reinigung,
  Role.Tellerwaescher,
  Role.Staff,
  Role.Personalabteilung,
];

@Controller('staff-schedule')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@Roles(...staffScheduleRoles)
@RequireModule(STAFF_MANAGEMENT_MODULE_KEY)
export class StaffScheduleController {
  constructor(private readonly staffPlanningService: StaffPlanningService) {}

  @Get()
  @Permissions('schedule.view')
  findSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('roleNeeded') roleNeeded?: string,
    @Query('status') status?: StaffShiftStatus,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    const filters: StaffShiftFilters = {
      locationId,
      departmentId,
      roleNeeded,
      status,
      start,
      end,
    };
    return this.staffPlanningService.findShifts(user, filters);
  }

  @Post('shifts')
  @Permissions('schedule.create')
  createShift(
    @Body() payload: CreateStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createShift(payload, user);
  }

  @Put('shifts/:id')
  @Permissions('schedule.update')
  updateShift(
    @Param('id') id: string,
    @Body() payload: UpdateStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.updateShift(id, payload, user);
  }

  @Delete('shifts/:id')
  @Permissions('schedule.delete')
  deleteShift(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.deleteShift(id, user);
  }

  @Post('publish')
  @Permissions('schedule.publish')
  async publish(
    @Body('shiftIds') shiftIds: string[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const published = await Promise.all(
      (shiftIds ?? []).map((id) =>
        this.staffPlanningService.publishShift(id, user),
      ),
    );
    return { published };
  }
}
