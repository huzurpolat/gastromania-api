import {
  Body,
  Controller,
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
import { RegionGuard } from '../auth/guards/region.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { RegionsService } from './regions.service';

@Controller('regions')
@UseGuards(JwtAuthGuard, TenantGuard, RegionGuard, RolesGuard, PermissionsGuard)
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
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Post()
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.Admin,
    Role.Bereichsleiter,
  )
  @Permissions('regions.create')
  create(@Body() dto: CreateRegionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.regionsService.create(dto, user);
  }

  @Get()
  @Permissions('regions.view')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.regionsService.findAll(user);
  }

  @Get(':id')
  @Permissions('regions.view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.regionsService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Bereichsleiter,
  )
  @Permissions('regions.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRegionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.regionsService.update(id, dto, user);
  }
}
