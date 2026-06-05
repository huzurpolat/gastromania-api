import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AreasService } from '../areas/areas.service';
import { CreateAreaDto } from '../areas/dto/create-area.dto';
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
import { CreateRegionDto } from '../regions/dto/create-region.dto';
import { RegionsService } from '../regions/regions.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UsersService } from '../users/users.service';
import { TenantsService } from './tenants.service';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, PermissionsGuard)
export class TenantSelfController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly areasService: AreasService,
    private readonly regionsService: RegionsService,
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

  @Get('areas')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.Admin,
    Role.Bereichsleiter,
  )
  @Permissions('regions.view')
  areas(@CurrentUser() user: AuthenticatedUser) {
    return this.areasService.findAll(user);
  }

  @Post('areas')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.Admin,
  )
  @Permissions('regions.create')
  createArea(
    @Body() dto: CreateAreaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.areasService.create({ ...dto, tenantId: user.tenantId }, user);
  }

  @Get('regions')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
  )
  @Permissions('regions.view')
  regions(@CurrentUser() user: AuthenticatedUser) {
    return this.regionsService.findAll(user);
  }

  @Post('regions')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.Admin,
    Role.Bereichsleiter,
  )
  @Permissions('regions.create')
  createRegion(
    @Body() dto: CreateRegionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.regionsService.create({ ...dto, tenantId: user.tenantId }, user);
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
