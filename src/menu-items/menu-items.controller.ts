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
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { MenuItemsService } from './menu-items.service';

@Controller('menu-items')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MenuItemsController {
  constructor(private readonly menuItemsService: MenuItemsService) {}

  @Post()
  @Roles(Role.Admin, Role.Filialleiter)
  create(@Body() createMenuItemDto: CreateMenuItemDto) {
    return this.menuItemsService.create(createMenuItemDto);
  }

  @Get()
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  findAll() {
    return this.menuItemsService.findAll();
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  findOne(@Param('id') id: string) {
    return this.menuItemsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  update(
    @Param('id') id: string,
    @Body() updateMenuItemDto: UpdateMenuItemDto,
  ) {
    return this.menuItemsService.update(id, updateMenuItemDto);
  }

  @Delete(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  remove(@Param('id') id: string) {
    return this.menuItemsService.remove(id);
  }
}
