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
import { TenantGuard } from '../auth/guards/tenant.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CitiesService } from './cities.service';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';

@Controller('tenant/cities')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(Role.TenantAdmin, Role.CompanyAdmin, Role.Bereichsleiter, Role.Regionalleiter)
export class CitiesController {
  constructor(private readonly citiesService: CitiesService) {}

  @Post()
  create(@Body() dto: CreateCityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.citiesService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('areaId') areaId?: string,
    @Query('regionId') regionId?: string,
  ) {
    return this.citiesService.findAll(user, { areaId, regionId });
  }

  @Get(':cityId')
  findOne(
    @Param('cityId') cityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.citiesService.findOne(cityId, user);
  }

  @Patch(':cityId')
  update(
    @Param('cityId') cityId: string,
    @Body() dto: UpdateCityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.citiesService.update(cityId, dto, user);
  }

  @Delete(':cityId')
  remove(
    @Param('cityId') cityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.citiesService.remove(cityId, user);
  }
}
