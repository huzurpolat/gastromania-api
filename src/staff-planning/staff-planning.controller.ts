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
import {
  AbsenceFiltersDto,
  CreateAbsenceDto,
  ReviewAbsenceDto,
} from './dto/absence.dto';
import {
  CreateAvailabilityDto,
  UpdateAvailabilityDto,
} from './dto/availability.dto';
import { CreateShiftSwapRequestDto } from './dto/shift-swap.dto';
import {
  GenerateShiftSuggestionsDto,
  ShiftSuggestionQueryDto,
} from './dto/shift-suggestion.dto';
import {
  ApplyStaffingPlanItemDto,
  GenerateStaffingPlanDto,
  StaffingAssistantPlanQueryDto,
} from './dto/staffing-assistant.dto';
import {
  PublishStaffScheduleDto,
  StaffMyScheduleQueryDto,
  StaffSchedulePublicationQueryDto,
} from './dto/schedule-publication.dto';
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
import { WorkingTimeAccountQueryDto } from './dto/working-time-account.dto';
import { UpdateWorkingTimeSettingsDto } from './dto/working-time-settings.dto';
import { StaffShiftStatus } from './schemas/staff-shift.schema';
import { StaffPlanningService } from './staff-planning.service';

export const staffRoles = [
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

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@Roles(...staffRoles)
@RequireModule(STAFF_MANAGEMENT_MODULE_KEY)
export class StaffPlanningController {
  constructor(private readonly staffPlanningService: StaffPlanningService) {}

  @Get('publications')
  @Permissions('schedule.view')
  findPublication(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffSchedulePublicationQueryDto,
  ) {
    return this.staffPlanningService.findPublication(user, query);
  }

  @Post('publications/publish')
  @Permissions('schedule.publish')
  publishSchedule(
    @Body() payload: PublishStaffScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.publishSchedule(payload, user);
  }

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

  @Get('shift-suggestions')
  @Permissions('schedule.view')
  findShiftSuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ShiftSuggestionQueryDto,
  ) {
    return this.staffPlanningService.findShiftSuggestions(user, query);
  }

  @Post('shift-suggestions/generate')
  @Permissions('schedule.create')
  generateShiftSuggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: GenerateShiftSuggestionsDto,
  ) {
    return this.staffPlanningService.generateShiftSuggestions(user, payload);
  }

  @Patch('shift-suggestions/:id/apply')
  @Permissions('schedule.create')
  applyShiftSuggestion(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.applyShiftSuggestion(id, user);
  }

  @Patch('shift-suggestions/:id/dismiss')
  @Permissions('schedule.update')
  dismissShiftSuggestion(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.dismissShiftSuggestion(id, user);
  }

  @Get('staffing-assistant/plans')
  @Permissions('schedule.view')
  findStaffingAssistantPlans(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffingAssistantPlanQueryDto,
  ) {
    return this.staffPlanningService.findStaffingAssistantPlans(user, query);
  }

  @Post('staffing-assistant/generate')
  @Permissions('schedule.create')
  generateStaffingAssistantPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: GenerateStaffingPlanDto,
  ) {
    return this.staffPlanningService.generateStaffingAssistantPlan(user, payload);
  }

  @Patch('staffing-assistant/plans/:id/apply-item')
  @Permissions('schedule.create')
  applyStaffingAssistantItem(
    @Param('id') id: string,
    @Body() payload: ApplyStaffingPlanItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.applyStaffingAssistantItem(id, payload, user);
  }

  @Patch('staffing-assistant/plans/:id/apply-all')
  @Permissions('schedule.create')
  applyAllStaffingAssistantItems(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.applyAllStaffingAssistantItems(id, user);
  }

  @Patch('staffing-assistant/plans/:id/dismiss')
  @Permissions('schedule.update')
  dismissStaffingAssistantPlan(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.dismissStaffingAssistantPlan(id, user);
  }

  @Get('my-schedule')
  findMySchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffMyScheduleQueryDto,
  ) {
    return this.staffPlanningService.findMySchedule(user, query);
  }

  @Get('working-time-account')
  @Permissions('timeTracking.view')
  findWorkingTimeAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkingTimeAccountQueryDto,
  ) {
    return this.staffPlanningService.findWorkingTimeAccount(user, query);
  }

  @Get('working-time-account/me')
  findMyWorkingTimeAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkingTimeAccountQueryDto,
  ) {
    return this.staffPlanningService.findMyWorkingTimeAccount(user, query);
  }

  @Get('working-time-settings')
  @Permissions('timeTracking.view')
  findWorkingTimeSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.findWorkingTimeSettings(user);
  }

  @Patch('working-time-settings')
  @Permissions('settings.update')
  updateWorkingTimeSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: UpdateWorkingTimeSettingsDto,
  ) {
    return this.staffPlanningService.updateWorkingTimeSettings(user, payload);
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

  @Delete('shifts/:id')
  @Permissions('schedule.delete')
  deleteShift(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.deleteShift(id, user);
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
  @Permissions('schedule.view')
  createAvailability(
    @Body() payload: CreateAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.createAvailability(payload, user);
  }

  @Patch('availability/:id')
  @Permissions('schedule.view')
  updateAvailability(
    @Param('id') id: string,
    @Body() payload: UpdateAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.updateAvailability(id, payload, user);
  }

  @Delete('availability/:id')
  @Permissions('schedule.view')
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
    @Query() filters: AbsenceFiltersDto,
  ) {
    return this.staffPlanningService.findAbsences(user, filters);
  }

  @Get('absences/:id')
  @Permissions('absence.view')
  findAbsence(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.findAbsence(id, user);
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
    @Body() payload: ReviewAbsenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.approveAbsence(id, user, payload);
  }

  @Patch('absences/:id/reject')
  @Permissions('absence.approve')
  rejectAbsence(
    @Param('id') id: string,
    @Body() payload: ReviewAbsenceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.rejectAbsence(id, user, payload);
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

  @Patch('shift-swaps/:id/request')
  requestShiftSwap(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.requestShiftSwap(id, user);
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

  @Patch('shift-swaps/:id/cancel')
  cancelShiftSwap(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.cancelShiftSwap(id, user);
  }
}
