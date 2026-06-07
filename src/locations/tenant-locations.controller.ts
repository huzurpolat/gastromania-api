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
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  CreateTenantLocationDto,
  UpdateTenantLocationDto,
} from './dto/create-tenant-location.dto';
import { LocationsService } from './locations.service';

@Controller('tenant/locations')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class TenantLocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Roles(Role.TenantAdmin, Role.CompanyAdmin)
  create(
    @Body() dto: CreateTenantLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.createTenantLocation(dto, user);
  }

  @Get()
  @Roles(Role.TenantAdmin, Role.CompanyAdmin, Role.LocationManager, Role.Filialleiter)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('areaId') areaId?: string,
    @Query('regionId') regionId?: string,
    @Query('cityId') cityId?: string,
  ) {
    return this.locationsService.findTenantLocations(user, {
      areaId,
      regionId,
      cityId,
    });
  }

  @Get(':locationId')
  @Roles(Role.TenantAdmin, Role.CompanyAdmin, Role.LocationManager, Role.Filialleiter)
  findOne(
    @Param('locationId') locationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.findTenantLocation(locationId, user);
  }

  @Patch(':locationId')
  @Roles(Role.TenantAdmin, Role.CompanyAdmin)
  update(
    @Param('locationId') locationId: string,
    @Body() dto: UpdateTenantLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.updateTenantLocation(locationId, dto, user);
  }

  @Delete(':locationId')
  @Roles(Role.TenantAdmin, Role.CompanyAdmin)
  remove(
    @Param('locationId') locationId: string,
    @Query('force') force: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.deleteTenantLocation(locationId, user, {
      force: force === 'true',
    });
  }
}
