import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateInventoryCategoryDto } from './dto/create-inventory-category.dto';
import { CreateInventoryLocationDto } from './dto/create-inventory-location.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import {
  CompleteInventorySessionDto,
  StartInventorySessionDto,
} from './dto/inventory-session.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { StockService } from './stock.service';

@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(Role.Admin, Role.Filialleiter, Role.Lager, Role.Einkauf, Role.Kueche, Role.Service)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post()
  @Permissions('inventory.create')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager, Role.Einkauf)
  create(
    @Body() payload: CreateStockItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.create(payload, user);
  }

  @Get()
  @Permissions('inventory.view')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockService.findAll(user, locationId);
  }

  @Get('dashboard')
  @Permissions('inventory.view')
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockService.dashboard(user, locationId);
  }

  @Get('alerts')
  @Permissions('inventory.view')
  findAlerts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockService.findAlerts(user, locationId);
  }

  @Get('reports')
  @Permissions('inventory.view')
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockService.report(user, locationId);
  }

  @Get('locations')
  @Permissions('inventory.view')
  findLocations(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockService.findLocations(user, locationId);
  }

  @Post('locations')
  @Permissions('inventory.create')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager)
  createLocation(
    @Body() payload: CreateInventoryLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.createLocation(payload, user);
  }

  @Patch('locations/:id')
  @Permissions('inventory.update')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager)
  updateLocation(
    @Param('id') id: string,
    @Body() payload: Partial<CreateInventoryLocationDto>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.updateLocation(id, payload, user);
  }

  @Delete('locations/:id')
  @Permissions('inventory.delete')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager)
  removeLocation(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stockService.removeLocation(id, user);
  }

  @Get('categories')
  @Permissions('categories.view')
  findCategories() {
    return this.stockService.findCategories();
  }

  @Post('categories')
  @Permissions('categories.create')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager, Role.Einkauf)
  createCategory(@Body() payload: CreateInventoryCategoryDto) {
    return this.stockService.createCategory(payload);
  }

  @Patch('categories/:id')
  @Permissions('categories.update')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager, Role.Einkauf)
  updateCategory(
    @Param('id') id: string,
    @Body() payload: Partial<CreateInventoryCategoryDto>,
  ) {
    return this.stockService.updateCategory(id, payload);
  }

  @Delete('categories/:id')
  @Permissions('categories.delete')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager, Role.Einkauf)
  removeCategory(@Param('id') id: string) {
    return this.stockService.removeCategory(id);
  }

  @Get('inventory-sessions')
  @Permissions('inventory.inventory.manage')
  listInventorySessions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockService.listInventorySessions(user, locationId);
  }

  @Post('inventory-sessions')
  @Permissions('inventory.inventory.manage')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager)
  startInventory(
    @Body() payload: StartInventorySessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.startInventory(payload, user);
  }

  @Post('inventory-sessions/:id/complete')
  @Permissions('inventory.inventory.manage')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager)
  completeInventory(
    @Param('id') id: string,
    @Body() payload: CompleteInventorySessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.completeInventory(id, payload, user);
  }

  @Get('movements')
  @Permissions('inventory.view')
  findMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.stockService.findMovements(user, locationId);
  }

  @Patch(':id')
  @Permissions('inventory.update')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager, Role.Einkauf)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateStockItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.update(id, payload, user);
  }

  @Post(':id/adjust')
  @Permissions('inventory.stock.adjust')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager, Role.Einkauf)
  adjust(
    @Param('id') id: string,
    @Body() payload: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockService.adjust(id, payload, user);
  }

  @Delete(':id')
  @Permissions('inventory.delete')
  @Roles(Role.Admin, Role.Filialleiter, Role.Lager)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stockService.remove(id, user);
  }

  @Sse('stream')
  @Permissions('inventory.view')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.stockService.stream(user);
  }
}
