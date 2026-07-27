import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { REPORTING_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import {
  CreateForecastEventDto,
  ForecastEventQueryDto,
  UpdateForecastEventDto,
} from './dto/forecast-event.dto';
import { ForecastQueryDto } from './dto/forecast-query.dto';
import { ForecastService } from './forecast.service';

const FORECAST_ROLES = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.Personalabteilung,
  Role.Buchhaltung,
];

@Controller('reports/forecast')
@RequireModule(REPORTING_MODULE_KEY)
@UseGuards(JwtAuthGuard, ModuleEnabledGuard, RolesGuard, PermissionsGuard)
@Roles(...FORECAST_ROLES)
@Permissions('reports.view')
export class ForecastController {
  constructor(private readonly forecastService: ForecastService) {}

  @Get()
  getForecast(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ForecastQueryDto,
  ) {
    return this.forecastService.getForecast(user, query);
  }

  @Get('events')
  getForecastEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ForecastEventQueryDto,
  ) {
    return this.forecastService.getForecastEvents(user, query);
  }

  @Post('events')
  createForecastEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateForecastEventDto,
  ) {
    return this.forecastService.createForecastEvent(user, dto);
  }

  @Patch('events/:id')
  updateForecastEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateForecastEventDto,
  ) {
    return this.forecastService.updateForecastEvent(user, id, dto);
  }

  @Delete('events/:id')
  deleteForecastEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.forecastService.deleteForecastEvent(user, id);
  }

  @Get('accuracy')
  getForecastAccuracy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ForecastQueryDto,
  ) {
    return this.forecastService.getForecastAccuracy(user, query);
  }
}
