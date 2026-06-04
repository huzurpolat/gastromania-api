import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulesService } from './modules.service';

@Controller('modules')
@UseGuards(JwtAuthGuard)
export class ModulesStatusController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get('status')
  getStatus() {
    return this.modulesService.getStatus();
  }
}
