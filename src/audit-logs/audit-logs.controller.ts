import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditLogService } from './audit-log.service';
import type { AuditLogQuery } from './audit-log.service';

@Controller('platform/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.SuperAdmin)
export class AuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(@Query() query: Record<string, string>) {
    return this.auditLogService.findPlatform(query as AuditLogQuery);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.auditLogService.findPlatformById(id);
  }
}
