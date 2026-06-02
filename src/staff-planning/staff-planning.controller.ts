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
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateAbsenceDto } from './dto/absence.dto';
import {
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
} from './dto/availability.dto';
import { CreateShiftSwapRequestDto } from './dto/shift-swap.dto';
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...staffRoles)
export class StaffPlanningController {
  constructor(private readonly staffPlanningService: StaffPlanningService) {}

  @Get('shifts')
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
  findShift(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.findShift(id, user);
  }

  @Post('shifts')
  createShift(
    @Body() payload: CreateStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createShift(payload, user);
  }

  @Patch('shifts/:id')
  updateShift(
    @Param('id') id: string,
    @Body() payload: UpdateStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.updateShift(id, payload, user);
  }

  @Patch('shifts/:id/assign')
  assignShift(
    @Param('id') id: string,
    @Body() payload: AssignStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.assignShift(id, payload, user);
  }

  @Patch('shifts/:id/unassign')
  unassignShift(
    @Param('id') id: string,
    @Body() payload: UnassignStaffShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.unassignShift(id, payload, user);
  }

  @Patch('shifts/:id/publish')
  publishShift(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.publishShift(id, user);
  }

  @Patch('shifts/:id/complete')
  completeShift(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.completeShift(id, user);
  }

  @Patch('shifts/:id/cancel')
  cancelShift(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.cancelShift(id, user);
  }

  @Get('availability')
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
  createAvailability(
    @Body() payload: CreateAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createAvailability(payload, user);
  }

  @Patch('availability/:id')
  updateAvailability(
    @Param('id') id: string,
    @Body() payload: UpdateAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.updateAvailability(id, payload, user);
  }

  @Delete('availability/:id')
  deleteAvailability(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.deleteAvailability(id, user);
  }

  @Get('absences')
  findAbsences(
    @CurrentUser() user: AuthenticatedUser,
    @Query('userId') userId?: string,
  ) {
    return this.staffPlanningService.findAbsences(user, { userId });
  }

  @Post('absences')
  createAbsence(
    @Body() payload: CreateAbsenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createAbsence(payload, user);
  }

  @Patch('absences/:id/approve')
  approveAbsence(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.approveAbsence(id, user);
  }

  @Patch('absences/:id/reject')
  rejectAbsence(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.rejectAbsence(id, user);
  }

  @Patch('absences/:id/cancel')
  cancelAbsence(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.cancelAbsence(id, user);
  }

  @Get('shift-swaps')
  findShiftSwaps(@CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.findShiftSwaps(user);
  }

  @Post('shift-swaps')
  createShiftSwap(
    @Body() payload: CreateShiftSwapRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createShiftSwap(payload, user);
  }

  @Patch('shift-swaps/:id/accept')
  acceptShiftSwap(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.acceptShiftSwap(id, user);
  }

  @Patch('shift-swaps/:id/approve')
  approveShiftSwap(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.approveShiftSwap(id, user);
  }

  @Patch('shift-swaps/:id/reject')
  rejectShiftSwap(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.rejectShiftSwap(id, user);
  }
}
