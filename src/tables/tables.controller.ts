import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
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
import { UpdateTableStatusDto } from './dto/update-table-status.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { TablesService } from './tables.service';

@Controller('tables')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post()
  @Permissions('tables.create')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter)
  create(@Body() createTableDto: CreateTableDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.create(createTableDto, user);
  }

  @Get()
  @Permissions('tables.view')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter, Role.Service)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('locationId') locationId?: string) {
    return this.tablesService.findAll(user, locationId);
  }

  @Get('overview')
  @Permissions('tables.view')
  @Roles(
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
    Role.Schichtleiter,
    Role.Service,
    Role.Kueche,
    Role.Bar,
    Role.Theke,
  )
  overview(@CurrentUser() user: AuthenticatedUser, @Query('locationId') locationId?: string) {
    return this.tablesService.overview(user, locationId);
  }

  @Post(':id/qr-token')
  @Permissions('tables.update')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter)
  generateQrToken(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.generateQrToken(id, user);
  }

  @Patch(':id/qr-token/revoke')
  @Permissions('tables.update')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter)
  revokeQrToken(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.revokeQrToken(id, user);
  }

  @Patch(':id/qr-enabled')
  @Permissions('tables.update')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter)
  setQrEnabled(
    @Param('id') id: string,
    @Body('enabled', ParseBoolPipe) enabled: boolean,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tablesService.setQrEnabled(id, enabled, user);
  }

  @Get(':id/qr-code')
  @Permissions('tables.view')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter, Role.Schichtleiter, Role.Service)
  getQrCode(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.getQrCodeInfo(id, user);
  }

  @Get(':id')
  @Permissions('tables.view')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter, Role.Service)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('tables.update')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.RegionAdmin, Role.Admin, Role.Regionalleiter, Role.Bereichsleiter, Role.Filialleiter)
  update(
    @Param('id') id: string,
    @Body() updateTableDto: UpdateTableDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tablesService.update(id, updateTableDto, user);
  }

  @Patch(':id/status')
  @Permissions('tables.status.update')
  @Roles(
    Role.PlatformAdmin,
    Role.SuperAdmin,
    Role.CompanyAdmin,
    Role.RegionAdmin,
    Role.Admin,
    Role.Regionalleiter,
    Role.Bereichsleiter,
    Role.Filialleiter,
    Role.Schichtleiter,
    Role.Service,
    Role.Theke,
  )
  updateStatus(
    @Param('id') id: string,
    @Body() updateTableStatusDto: UpdateTableStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tablesService.updateStatus(id, updateTableStatusDto, user);
  }

  @Delete(':id')
  @Permissions('tables.delete')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tablesService.remove(id, user);
  }
}
