import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { AreasService } from './areas.service';
import { CreateAreaDto } from './dto/create-area.dto';
import { UpdateAreaDto } from './dto/update-area.dto';

@Controller('tenant/areas')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Post()
  @Roles(Role.TenantAdmin, Role.CompanyAdmin)
  create(@Body() dto: CreateAreaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.areasService.create(dto, user);
  }

  @Get()
  @Roles(Role.TenantAdmin, Role.CompanyAdmin)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('includeRegions') includeRegions?: string,
  ) {
    return this.areasService.findAll(user, includeRegions === 'true');
  }

  @Get(':areaId')
  @Roles(Role.TenantAdmin, Role.CompanyAdmin, Role.Bereichsleiter, Role.Regionalleiter)
  findOne(@Param('areaId') areaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.areasService.findOne(areaId, user);
  }

  @Patch(':areaId')
  @Roles(Role.TenantAdmin, Role.CompanyAdmin)
  update(
    @Param('areaId') areaId: string,
    @Body() dto: UpdateAreaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.areasService.update(areaId, dto, user);
  }

  @Delete(':areaId')
  @Roles(Role.TenantAdmin, Role.CompanyAdmin)
  remove(@Param('areaId') areaId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.areasService.remove(areaId, user);
  }

  @Get(':areaId/users')
  @Roles(Role.TenantAdmin, Role.CompanyAdmin, Role.Bereichsleiter, Role.Regionalleiter)
  findUsers(
    @Param('areaId') areaId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.areasService.findUsers(areaId, user);
  }

  @Post(':areaId/users')
  @Roles(Role.TenantAdmin, Role.CompanyAdmin)
  assignUser(
    @Param('areaId') areaId: string,
    @Body('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.areasService.assignUser(areaId, userId, user);
  }

  @Delete(':areaId/users/:userId')
  @Roles(Role.TenantAdmin, Role.CompanyAdmin)
  unassignUser(
    @Param('areaId') areaId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.areasService.unassignUser(areaId, userId, user);
  }
}
