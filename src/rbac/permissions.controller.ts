import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RbacService } from './rbac.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('permissions')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin)
  @Permissions('roles.view')
  findAll() {
    return this.rbacService.permissionsCatalog();
  }

  @Get('users/:id/permissions')
  @Roles(
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
  )
  @Permissions('users.view')
  userPermissions(@Param('id') id: string) {
    return this.rbacService.permissionsForUser(id);
  }
}
