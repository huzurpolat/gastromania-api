import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { STAFF_MANAGEMENT_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import { StaffPlanningService } from './staff-planning.service';
import { staffRoles } from './staff-planning.controller';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@Roles(...staffRoles)
@RequireModule(STAFF_MANAGEMENT_MODULE_KEY)
export class StaffNotificationsController {
  constructor(private readonly staffPlanningService: StaffPlanningService) {}

  @Get()
  findMyNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.findNotifications(user);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.markNotificationRead(id, user);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.staffPlanningService.markAllNotificationsRead(user);
  }
}
