import { Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { DemoDataResult, DemoDataService } from './demo-data.service';

@Controller('demo-data')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DemoDataController {
  constructor(private readonly demoDataService: DemoDataService) {}

  @Post('seed')
  @Permissions('settings.update')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin)
  seed(@CurrentUser() user: AuthenticatedUser): Promise<DemoDataResult> {
    return this.demoDataService.seed(user);
  }
}
