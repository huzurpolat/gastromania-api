import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AreaGuard } from '../auth/guards/area.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { AreasService } from './areas.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@Controller('areas')
@UseGuards(JwtAuthGuard, TenantGuard, AreaGuard, RolesGuard, PermissionsGuard)
@Roles(
  Role.TenantAdmin,
  Role.RestaurantAdmin,
  Role.CompanyAdmin,
  Role.Admin,
  Role.Bereichsleiter,
)
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Post()
  @Roles(
    Role.TenantAdmin,
    Role.RestaurantAdmin,
    Role.CompanyAdmin,
    Role.Admin,
  )
  @Permissions('regions.create')
  create(@Body() dto: CreateAreaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.areasService.create(dto, user);
  }

  @Get()
  @Permissions('regions.view')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.areasService.findAll(user);
  }

  @Get(':id')
  @Permissions('regions.view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.areasService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('regions.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAreaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.areasService.update(id, dto, user);
  }
}
