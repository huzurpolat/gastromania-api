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
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateWeeklyMenuDto } from './dto/create-weekly-menu.dto';
import { UpdateWeeklyMenuDto } from './dto/update-weekly-menu.dto';
import { WeeklyMenusService } from './weekly-menus.service';

@Controller('weekly-menus')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WeeklyMenusController {
  constructor(private readonly weeklyMenusService: WeeklyMenusService) {}

  @Post()
  @Roles(Role.Admin, Role.Filialleiter)
  create(
    @Body() createWeeklyMenuDto: CreateWeeklyMenuDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.weeklyMenusService.create(createWeeklyMenuDto, user);
  }

  @Get()
  @Roles(Role.Admin, Role.Filialleiter, Role.Service, Role.Kueche)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.weeklyMenusService.findAll(user, { locationId, start, end });
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  update(
    @Param('id') id: string,
    @Body() updateWeeklyMenuDto: UpdateWeeklyMenuDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.weeklyMenusService.update(id, updateWeeklyMenuDto, user);
  }

  @Delete(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.weeklyMenusService.remove(id, user);
  }
}
