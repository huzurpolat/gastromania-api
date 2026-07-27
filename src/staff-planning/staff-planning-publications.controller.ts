import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { STAFF_MANAGEMENT_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import {
  PublishStaffScheduleDto,
  StaffSchedulePublicationQueryDto,
} from './dto/schedule-publication.dto';
import { StaffPlanningService } from './staff-planning.service';
import { staffRoles } from './staff-planning.controller';

@Controller('staff-planning/publications')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@Roles(...staffRoles)
@RequireModule(STAFF_MANAGEMENT_MODULE_KEY)
export class StaffPlanningPublicationsController {
  constructor(private readonly staffPlanningService: StaffPlanningService) {}

  @Get()
  @Permissions('schedule.view')
  findPublication(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StaffSchedulePublicationQueryDto,
  ) {
    return this.staffPlanningService.findPublication(user, query);
  }

  @Post('publish')
  @Permissions('schedule.publish')
  publishSchedule(
    @Body() payload: PublishStaffScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.staffPlanningService.publishSchedule(payload, user);
  }
}
