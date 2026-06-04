import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateModuleDto } from './dto/update-module.dto';
import { ModulesService } from './modules.service';

@Controller('admin/modules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin)
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get()
  findAll() {
    return this.modulesService.findAll();
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: UpdateModuleDto) {
    return this.modulesService.updateEnabled(key, dto.enabled);
  }
}
