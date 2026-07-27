import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { ModulesService } from '../modules/modules.service';
import { CreateModuleDefinitionDto } from '../modules/dto/create-module-definition.dto';
import { UpdateModuleDefinitionDto } from '../modules/dto/update-module-definition.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantModuleDto } from './dto/update-tenant-module.dto';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';
import { UpdateTenantBillingDto } from './dto/update-tenant-billing.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';
import { PlatformUserStatusDto } from '../users/dto/platform-user-status.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  CreatePlatformTenantAdminDto,
  PlatformTenantAdminPasswordResetDto,
  PlatformTenantAdminStatusDto,
  UpdatePlatformTenantAdminDto,
} from '../users/dto/platform-tenant-admin.dto';
import { UpdatePlatformTenantUserDto } from '../users/dto/platform-tenant-user-update.dto';
import type { PlatformUserListQuery } from '../users/users.service';
import { UsersService } from '../users/users.service';

@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.SuperAdmin)
export class PlatformTenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly modulesService: ModulesService,
    private readonly usersService: UsersService,
  ) {}

  @Get('tenants')
  findAllTenants() {
    return this.tenantsService.findAll();
  }

  @Get('billing/plans')
  findBillingPlans() {
    return this.tenantsService.findPlans();
  }

  @Post('tenants')
  createTenant(
    @Body() dto: CreateTenantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tenantsService.create(dto, actor);
  }

  @Get('tenants/:tenantId/users')
  findTenantUsers(
    @Param('tenantId') tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.findPlatformTenantUsers(tenantId, actor);
  }

  @Get('tenants/:tenantId/users/:userId')
  findTenantUser(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.findPlatformTenantUser(tenantId, userId, actor);
  }

  @Patch('tenants/:tenantId/users/:userId')
  updateTenantUser(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdatePlatformTenantUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updatePlatformTenantUser(
      tenantId,
      userId,
      dto,
      actor,
    );
  }

  @Delete('tenants/:tenantId/users/:userId')
  deleteTenantUser(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.deletePlatformTenantUser(
      tenantId,
      userId,
      actor,
    );
  }

  @Get('tenants/:tenantId/admins')
  findTenantAdmins(
    @Param('tenantId') tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.findPlatformTenantAdmins(tenantId, actor);
  }

  @Post('tenants/:tenantId/admins')
  createTenantAdmin(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreatePlatformTenantAdminDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.createPlatformTenantAdmin(tenantId, dto, actor);
  }

  @Patch('tenants/:tenantId/admins/:userId')
  updateTenantAdmin(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdatePlatformTenantAdminDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updatePlatformTenantAdmin(
      tenantId,
      userId,
      dto,
      actor,
    );
  }

  @Patch('tenants/:tenantId/admins/:userId/status')
  updateTenantAdminStatus(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: PlatformTenantAdminStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updatePlatformTenantAdminStatus(
      tenantId,
      userId,
      dto.status,
      actor,
    );
  }

  @Post('tenants/:tenantId/admins/:userId/reset-password')
  resetTenantAdminPassword(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() dto: PlatformTenantAdminPasswordResetDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.resetPlatformTenantAdminPassword(
      tenantId,
      userId,
      dto.newPassword,
      actor,
    );
  }

  @Get('users')
  findPlatformUsers(
    @Query() query: PlatformUserListQuery,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.findPlatformUsers(query, actor);
  }

  @Post('users')
  createPlatformUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.createPlatformUser(dto, actor);
  }

  @Get('users/:userId')
  findPlatformUser(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.findPlatformUser(userId, actor);
  }

  @Patch('users/:userId')
  updatePlatformUser(
    @Param('userId') userId: string,
    @Body() dto: UpdatePlatformTenantUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updatePlatformUser(userId, dto, actor);
  }

  @Post('users/:userId/reset-password')
  resetPlatformUserPassword(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.resetPlatformUserPassword(userId, actor);
  }

  @Patch('users/:userId/status')
  updatePlatformUserStatus(
    @Param('userId') userId: string,
    @Body() dto: PlatformUserStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.updatePlatformUserStatus(
      userId,
      dto.status,
      actor,
    );
  }

  @Delete('users/:userId')
  deletePlatformUser(
    @Param('userId') userId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.deletePlatformUser(userId, actor);
  }

  @Get('tenants/:tenantId')
  findTenant(@Param('tenantId') tenantId: string) {
    return this.tenantsService.findOne(tenantId);
  }

  @Patch('tenants/:tenantId')
  updateTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tenantsService.update(tenantId, dto, actor);
  }

  @Delete('tenants/:tenantId')
  softDeleteTenant(
    @Param('tenantId') tenantId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tenantsService.softDelete(tenantId, actor);
  }

  @Patch('tenants/:tenantId/status')
  updateTenantStatus(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantStatusDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tenantsService.updateStatus(tenantId, dto, actor);
  }

  @Get('tenants/:tenantId/billing')
  findTenantBilling(@Param('tenantId') tenantId: string) {
    return this.tenantsService.findBilling(tenantId);
  }

  @Patch('tenants/:tenantId/billing')
  updateTenantBilling(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantBillingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tenantsService.updateBilling(tenantId, dto, actor);
  }

  @Get('tenants/:tenantId/modules')
  findTenantModules(@Param('tenantId') tenantId: string) {
    return this.tenantsService.findTenantModules(tenantId);
  }

  @Patch('tenants/:tenantId/modules/:moduleKey')
  updateTenantModule(
    @Param('tenantId') tenantId: string,
    @Param('moduleKey') moduleKey: string,
    @Body() dto: UpdateTenantModuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.tenantsService.updateTenantModule(
      tenantId,
      moduleKey,
      dto,
      actor,
    );
  }

  @Get('module-definitions')
  findModuleDefinitions() {
    return this.modulesService.findAll();
  }

  @Post('module-definitions')
  createModuleDefinition(@Body() dto: CreateModuleDefinitionDto) {
    return this.modulesService.createDefinition(dto);
  }

  @Patch('module-definitions/:key')
  updateModuleDefinition(
    @Param('key') key: string,
    @Body() dto: UpdateModuleDefinitionDto,
  ) {
    return this.modulesService.updateDefinition(key, dto);
  }
}
