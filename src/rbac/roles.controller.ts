import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../auth/types/authenticated-request.type';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateManagedRoleDto,
  UpdateManagedRoleDto,
  UpdateRolePermissionsDto,
} from './dto/role.dto';
import { RbacService } from './rbac.service';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.SuperAdmin, Role.Admin)
export class RolesController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  @Permissions('roles.view')
  findAll() {
    return this.rbacService.findRoles();
  }

  @Post()
  @Permissions('roles.create')
  create(
    @Body() dto: CreateManagedRoleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rbacService.createRole(dto, user, request.ip);
  }

  @Put(':id')
  @Permissions('roles.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateManagedRoleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rbacService.updateRole(id, dto, user, request.ip);
  }

  @Delete(':id')
  @Permissions('roles.delete')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rbacService.deleteRole(id, user, request.ip);
  }

  @Post(':id/permissions')
  @Permissions('roles.permissions.update')
  setPermissions(
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rbacService.setRolePermissions(
      id,
      dto.permissions,
      user,
      request.ip,
    );
  }

  @Delete(':id/permissions/:permissionId')
  @Permissions('roles.permissions.update')
  removePermission(
    @Param('id') id: string,
    @Param('permissionId') permissionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.rbacService.removeRolePermission(
      id,
      permissionId,
      user,
      request.ip,
    );
  }
}
