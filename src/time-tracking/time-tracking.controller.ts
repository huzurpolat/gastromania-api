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
import { TIME_TRACKING_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import {
  ClockOutTimeEntryDto,
  CreateTimeEntryDto,
} from './dto/create-time-entry.dto';
import { CorrectTimeEntryDto } from './dto/correct-time-entry.dto';
import { TimeEntryBreakDto } from './dto/time-entry-break.dto';
import { CreateTimeCorrectionDto } from './dto/time-correction.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { WorktimeReportQueryDto } from './dto/worktime-report.dto';
import { TimeCorrectionStatus } from './schemas/time-correction.schema';
import { TimeEntryStatus } from './schemas/time-entry.schema';
import { TimeTrackingService } from './time-tracking.service';

@Controller('time-tracking')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule(TIME_TRACKING_MODULE_KEY)
@Roles(
  Role.TenantAdminCode,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.LocationManager,
  Role.Waiter,
  Role.Service,
  Role.Kitchen,
  Role.Kueche,
  Role.Bar,
  Role.Counter,
  Role.Theke,
  Role.Cashier,
  Role.Kasse,
  Role.InventoryManager,
  Role.Lager,
  Role.Dishwasher,
  Role.Staff,
  Role.Reinigung,
  Role.Tellerwaescher,
  Role.Personalabteilung,
)
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @Post('clock-in')
  @Permissions('timeTracking.clock')
  clockIn(
    @Body() createTimeEntryDto: CreateTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.clockIn(createTimeEntryDto, user);
  }

  @Patch(':id/clock-out')
  @Permissions('timeTracking.clock')
  clockOut(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.timeTrackingService.clockOut(id, user);
  }

  @Post('clock-out')
  @Permissions('timeTracking.clock')
  clockOutCurrent(
    @Body() payload: ClockOutTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.clockOut(undefined, user, payload);
  }

  @Post(':timeEntryId/breaks/start')
  @Permissions('timeTracking.clock')
  startBreak(
    @Param('timeEntryId') timeEntryId: string,
    @Body() payload: TimeEntryBreakDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.startBreak(timeEntryId, user, payload);
  }

  @Post(':timeEntryId/breaks/end')
  @Permissions('timeTracking.clock')
  endBreak(
    @Param('timeEntryId') timeEntryId: string,
    @Body() payload: TimeEntryBreakDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.endBreak(timeEntryId, user, payload);
  }

  @Get(':timeEntryId/breaks')
  @Permissions('timeTracking.view')
  findBreaks(
    @Param('timeEntryId') timeEntryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.findBreaks(timeEntryId, user);
  }

  @Get('reports/worktime')
  @Permissions('timeTracking.view')
  getWorktimeReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorktimeReportQueryDto,
  ) {
    return this.timeTrackingService.getWorktimeReport(user, query);
  }

  @Patch(':timeEntryId/correction')
  @Permissions('timeTracking.correct')
  correctTimeEntry(
    @Param('timeEntryId') timeEntryId: string,
    @Body() payload: CorrectTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.correctTimeEntry(timeEntryId, user, payload);
  }

  @Get('me')
  @Permissions('timeTracking.view')
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: TimeEntryStatus,
  ) {
    return this.timeTrackingService.findMine(user, {
      locationId,
      dateFrom,
      dateTo,
      status,
    });
  }

  @Get()
  @Permissions('timeTracking.view')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: TimeEntryStatus,
    @Query('open') open?: string,
  ) {
    return this.timeTrackingService.findAll(user, {
      locationId,
      employeeId,
      start,
      end,
      dateFrom,
      dateTo,
      status,
      open,
    });
  }

  @Get('corrections')
  @Permissions('timeTracking.correct')
  findCorrections(
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId?: string,
    @Query('status') status?: TimeCorrectionStatus,
  ) {
    return this.timeTrackingService.findCorrections(user, {
      employeeId,
      status,
    });
  }

  @Post('corrections')
  @Permissions('timeTracking.clock')
  requestCorrection(
    @Body() payload: CreateTimeCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.requestCorrection(payload, user);
  }

  @Patch('corrections/:id/approve')
  @Permissions('timeTracking.correct')
  approveCorrection(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.approveCorrection(id, user);
  }

  @Patch('corrections/:id/reject')
  @Permissions('timeTracking.correct')
  rejectCorrection(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.rejectCorrection(id, user);
  }

  @Patch(':id')
  @Permissions('timeTracking.view')
  @Roles(
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
  )
  update(
    @Param('id') id: string,
    @Body() updateTimeEntryDto: UpdateTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.update(id, updateTimeEntryDto, user);
  }

  @Delete(':id')
  @Permissions('timeTracking.view')
  @Roles(
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
  )
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.timeTrackingService.remove(id, user);
  }
}
