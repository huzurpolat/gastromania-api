import { Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { DemoDataResult, DemoDataService } from './demo-data.service';

@Controller('demo-data')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DemoDataController {
  constructor(private readonly demoDataService: DemoDataService) {}

  @Post('seed')
  @Roles(Role.Admin)
  seed(@CurrentUser() user: AuthenticatedUser): Promise<DemoDataResult> {
    return this.demoDataService.seed(user);
  }
}
