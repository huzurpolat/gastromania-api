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
import { CreateAbsenceDto } from './dto/absence.dto';
import {
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
} from './dto/availability.dto';
import { CreateShiftSwapRequestDto } from './dto/shift-swap.dto';
import {
  CreateShiftTemplateDto,
  UpdateShiftTemplateDto,
} from './dto/shift-template.dto';
import {
  AssignStaffShiftDto,
  CreateStaffShiftDto,
  UnassignStaffShiftDto,
  UpdateStaffShiftDto,
} from './dto/staff-shift.dto';
import { StaffShiftStatus } from './schemas/staff-shift.schema';
import { StaffPlanningService } from './staff-planning.service';

const staffRoles = [
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
  Role.Lager,
  Role.Reinigung,
  Role.Tellerwaescher,
  Role.Personalabteilung,
];

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(...staffRoles)
export class StaffPlanningController {
  constructor(private readonly staffPlanningService: StaffPlanningService) {}

  @Get('shift-templates')
  @Permissions('schedule.view')
  findTemplates(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.staffPlanningService.findTemplates(user, { locationId });
  }

  @Post('shift-templates')
  @Permissions('schedule.create')
  createTemplate(
    @Body() payload: CreateShiftTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createTemplate(payload, user);
  }

  @Patch('shift-templates/:id')
  @Permissions('schedule.update')
  updateTemplate(
    @Param('id') id: string,
    @Body() payload: UpdateShiftTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.updateTemplate(id, payload, user);
  }

  @Delete('shift-templates/:id')
  @Permissions('schedule.update')
  deleteTemplate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.deleteTemplate(id, user);
  }

  @Get('shifts')
  @Permissions('schedule.view')
  findShifts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('roleNeeded') roleNeeded?: string,
    @Query('status') status?: StaffShiftStatus,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('mine') mine?: string,
  ) {
    return this.staffPlanningService.findShifts(user, {
      locationId,
      departmentId,
      roleNeeded,
      status,
      start,
      end,
      mine: mine === 'true',
    });
  }

  @Get('shifts/:id')
  @Permissions('schedule.view')
  findShift(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.findShift(id, user);
  }

  @Post('shifts')
  @Permissions('schedule.create')
  createShift(
    @Body() payload: CreateStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createShift(payload, user);
  }

  @Patch('shifts/:id')
  @Permissions('schedule.update')
  updateShift(
    @Param('id') id: string,
    @Body() payload: UpdateStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.updateShift(id, payload, user);
  }

  @Patch('shifts/:id/assign')
  @Permissions('schedule.update')
  assignShift(
    @Param('id') id: string,
    @Body() payload: AssignStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.assignShift(id, payload, user);
  }

  @Patch('shifts/:id/unassign')
  @Permissions('schedule.update')
  unassignShift(
    @Param('id') id: string,
    @Body() payload: UnassignStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.unassignShift(id, payload, user);
  }

  @Patch('shifts/:id/publish')
  @Permissions('schedule.publish')
  publishShift(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.publishShift(id, user);
  }

  @Patch('shifts/:id/complete')
  @Permissions('schedule.update')
  completeShift(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.completeShift(id, user);
  }

  @Patch('shifts/:id/cancel')
  @Permissions('schedule.update')
  cancelShift(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.cancelShift(id, user);
  }

  @Get('availability')
  @Permissions('schedule.view')
  findAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('userId') userId?: string,
  ) {
    return this.staffPlanningService.findAvailability(user, {
      locationId,
      userId,
    });
  }

  @Post('availability')
  @Permissions('schedule.update')
  createAvailability(
    @Body() payload: CreateAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createAvailability(payload, user);
  }

  @Patch('availability/:id')
  @Permissions('schedule.update')
  updateAvailability(
    @Param('id') id: string,
    @Body() payload: UpdateAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.updateAvailability(id, payload, user);
  }

  @Delete('availability/:id')
  @Permissions('schedule.update')
  deleteAvailability(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.deleteAvailability(id, user);
  }

  @Get('absences')
  @Permissions('absence.view')
  findAbsences(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    return this.staffPlanningService.findAbsences(user, { userId });
  }

  @Post('absences')
  @Permissions('absence.request')
  createAbsence(
    @Body() payload: CreateAbsenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createAbsence(payload, user);
  }

  @Patch('absences/:id/approve')
  @Permissions('absence.approve')
  approveAbsence(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.approveAbsence(id, user);
  }

  @Patch('absences/:id/reject')
  @Permissions('absence.approve')
  rejectAbsence(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.rejectAbsence(id, user);
  }

  @Patch('absences/:id/cancel')
  @Permissions('absence.request')
  cancelAbsence(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.cancelAbsence(id, user);
  }

  @Get('shift-swaps')
  @Permissions('schedule.view')
  findShiftSwaps(@CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.findShiftSwaps(user);
  }

  @Post('shift-swaps')
  @Permissions('schedule.update')
  createShiftSwap(
    @Body() payload: CreateShiftSwapRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createShiftSwap(payload, user);
  }

  @Patch('shift-swaps/:id/accept')
  @Permissions('schedule.update')
  acceptShiftSwap(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.acceptShiftSwap(id, user);
  }

  @Patch('shift-swaps/:id/approve')
  @Permissions('schedule.update')
  approveShiftSwap(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.approveShiftSwap(id, user);
  }

  @Patch('shift-swaps/:id/reject')
  @Permissions('schedule.update')
  rejectShiftSwap(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.rejectShiftSwap(id, user);
  }
}
