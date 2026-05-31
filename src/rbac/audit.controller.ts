import { Controller, Get, UseGuards } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RbacService } from './rbac.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin)
export class AuditController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  @Permissions('audit.view')
  findAll() {
    return this.rbacService.auditLogs();
  }
}
