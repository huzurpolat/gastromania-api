import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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

@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PlatformAdmin, Role.SuperAdmin)
export class PlatformTenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly modulesService: ModulesService,
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
