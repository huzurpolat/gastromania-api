import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LocationGuard } from '../auth/guards/location.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(JwtAuthGuard, TenantGuard, LocationGuard, RolesGuard, PermissionsGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Permissions('locations.create')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
  )
  create(
    @Body() createLocationDto: CreateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.create(createLocationDto, user);
  }

  @Get()
  @Permissions('locations.view')
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
    Role.Schichtleiter,
    Role.Waiter,
    Role.Service,
    Role.Kitchen,
    Role.Kueche,
    Role.Counter,
    Role.Theke,
    Role.Cashier,
    Role.Kasse,
    Role.InventoryManager,
    Role.Lager,
    Role.Dishwasher,
    Role.Staff,
    Role.Tellerwaescher,
    Role.Reinigung,
  )
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.locationsService.findAll(user);
  }

  @Get(':id')
  @Permissions('locations.view')
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
    Role.Schichtleiter,
    Role.Waiter,
    Role.Service,
    Role.Kitchen,
    Role.Kueche,
    Role.Counter,
    Role.Theke,
    Role.Cashier,
    Role.Kasse,
    Role.InventoryManager,
    Role.Lager,
    Role.Dishwasher,
    Role.Staff,
    Role.Tellerwaescher,
    Role.Reinigung,
  )
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.locationsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('locations.update')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
  )
  update(
    @Param('id') id: string,
    @Body() updateLocationDto: UpdateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.update(id, updateLocationDto, user);
  }

  @Delete(':id')
  @Permissions('locations.delete')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
  )
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.locationsService.remove(id, user);
  }
}
