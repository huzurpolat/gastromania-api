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
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { TablesService } from './tables.service';

@Controller('tables')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Post()
  @Roles(Role.Admin, Role.Filialleiter)
  create(@Body() createTableDto: CreateTableDto) {
    return this.tablesService.create(createTableDto);
  }

  @Get()
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  findAll(@Query('locationId') locationId?: string) {
    return this.tablesService.findAll(locationId);
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  findOne(@Param('id') id: string) {
    return this.tablesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  update(@Param('id') id: string, @Body() updateTableDto: UpdateTableDto) {
    return this.tablesService.update(id, updateTableDto);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(@Param('id') id: string) {
    return this.tablesService.remove(id);
  }
}
