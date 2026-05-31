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
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
  @Permissions('locations.create')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin)
  create(
    @Body() createLocationDto: CreateLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.locationsService.create(createLocationDto, user);
  }

  @Get()
  @Permissions('locations.view')
  @Roles(
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Filialleiter,
    Role.Restaurantleiter,
    Role.Schichtleiter,
    Role.Service,
    Role.Kueche,
    Role.Lager,
    Role.Tellerwaescher,
    Role.Reinigung,
  )
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.locationsService.findAll(user);
  }

  @Get(':id')
  @Permissions('locations.view')
  @Roles(
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Filialleiter,
    Role.Restaurantleiter,
    Role.Schichtleiter,
    Role.Service,
    Role.Kueche,
    Role.Lager,
    Role.Tellerwaescher,
    Role.Reinigung,
  )
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.locationsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('locations.update')
  @Roles(
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.Admin,
    Role.Regionalleiter,
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
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.locationsService.remove(id, user);
  }
}
