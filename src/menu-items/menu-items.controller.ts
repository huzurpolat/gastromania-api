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
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuItemsService } from './menu-items.service';

@Controller('menu-items')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MenuItemsController {
  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Post()
  @Permissions('menuItems.create')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin, Role.Regionalleiter, Role.Filialleiter)
  create(@Body() createMenuItemDto: CreateMenuItemDto, @CurrentUser() user: AuthenticatedUser) {
    return this.menuItemsService.create(createMenuItemDto, user);
  }

  @Get()
  @Permissions('menuItems.view')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin, Role.Regionalleiter, Role.Filialleiter, Role.Service, Role.Kueche)
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.menuItemsService.findAll(user);
  }

  @Get(':id')
  @Permissions('menuItems.view')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin, Role.Regionalleiter, Role.Filialleiter, Role.Service, Role.Kueche)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.menuItemsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('menuItems.update')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin, Role.Regionalleiter, Role.Filialleiter)
  update(
    @Param('id') id: string,
    @Body() updateMenuItemDto: UpdateMenuItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.menuItemsService.update(id, updateMenuItemDto, user);
  }

  @Delete(':id')
  @Permissions('menuItems.delete')
  @Roles(Role.PlatformAdmin, Role.SuperAdmin, Role.CompanyAdmin, Role.Admin, Role.Regionalleiter, Role.Filialleiter)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.menuItemsService.remove(id, user);
  }
}
