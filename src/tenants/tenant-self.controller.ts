import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateLocationDto } from '../locations/dto/create-location.dto';
import { LocationsService } from '../locations/locations.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { TenantUserPasswordResetDto } from '../users/dto/tenant-user-password-reset.dto';
import { TenantUserStatusDto } from '../users/dto/tenant-user-status.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { UsersService } from '../users/users.service';
import { TenantsService } from './tenants.service';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class TenantSelfController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly locationsService: LocationsService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.getCurrentTenant(user);
  }

  @Get('modules')
  modules(@CurrentUser() user: AuthenticatedUser) {
    return this.tenantsService.getCurrentTenantModules(user);
  }

  @Get('users')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
    Role.Restaurantleiter,
  )
  @Permissions('users.view')
  users(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findAll(user);
  }

  @Get('users/:id')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
    Role.Restaurantleiter,
  )
  @Permissions('users.view')
  userById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.findById(id, user);
  }

  @Post('users')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
    Role.Restaurantleiter,
  )
  @Permissions('users.create')
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.create({ ...dto, tenantId: user.tenantId }, undefined, user);
  }

  @Patch('users/:id')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
    Role.Restaurantleiter,
  )
  @Permissions('users.update')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.update(id, { ...dto, tenantId: user.tenantId }, user);
  }

  @Patch('users/:id/status')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
    Role.Restaurantleiter,
  )
  @Permissions('users.update')
  updateUserStatus(
    @Param('id') id: string,
    @Body() dto: TenantUserStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.updateTenantUserStatus(id, dto.status, user);
  }

  @Post('users/:id/reset-password')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
    Role.Restaurantleiter,
  )
  @Permissions('users.update')
  resetUserPassword(
    @Param('id') id: string,
    @Body() dto: TenantUserPasswordResetDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.resetTenantUserPassword(id, dto.newPassword, user);
  }

  @Get('locations')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
    Role.Restaurantleiter,
  )
  @Permissions('locations.view')
  locations(@CurrentUser() user: AuthenticatedUser) {
    return this.locationsService.findAll(user);
  }

  @Post('locations')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
  )
  @Permissions('locations.create')
  createLocation(
    @Body() dto: CreateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.create({ ...dto, tenantId: user.tenantId }, user);
  }
}
