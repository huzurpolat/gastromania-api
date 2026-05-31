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
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { TablesService } from './tables.service';

@Controller('tables')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post()
  @Permissions('locations.create')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter)
  create(@Body() createTableDto: CreateTableDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.create(createTableDto, user);
  }

  @Get()
  @Permissions('locations.view')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter, Role.Service)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('locationId') locationId?: string) {
    return this.tablesService.findAll(user, locationId);
  }

  @Get(':id')
  @Permissions('locations.view')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter, Role.Service)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('locations.update')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter)
  update(
    @Param('id') id: string,
    @Body() updateTableDto: UpdateTableDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tablesService.update(id, updateTableDto, user);
  }

  @Delete(':id')
  @Permissions('locations.delete')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.remove(id, user);
  }
}
