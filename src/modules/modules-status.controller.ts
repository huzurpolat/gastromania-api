import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { ModulesService } from './modules.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ModulesStatusController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get('tenant/modules')
  getTenantModules(@CurrentUser() user: AuthenticatedUser) {
    return this.modulesService.getStatus(user);
  }
}
