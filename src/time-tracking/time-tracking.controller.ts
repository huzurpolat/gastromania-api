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
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { CreateTimeCorrectionDto } from './dto/time-correction.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { TimeCorrectionStatus } from './schemas/time-correction.schema';
import { TimeTrackingService } from './time-tracking.service';

@Controller('time-tracking')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(
  Role.PlatformAdmin,
  Role.SuperAdmin,
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

  @Get()
  @Permissions('timeTracking.view')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('open') open?: string,
  ) {
    return this.timeTrackingService.findAll(user, {
      locationId,
      employeeId,
      start,
      end,
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
    Role.PlatformAdmin,
    Role.SuperAdmin,
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
    Role.PlatformAdmin,
    Role.SuperAdmin,
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
