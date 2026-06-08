import {
  Body,
  Controller,
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
import { DAILY_CLOSING_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import { DailyClosingsService } from './daily-closings.service';
import {
  CompleteDailyClosingDto,
  GenerateDailyClosingDto,
  LockDailyClosingDto,
  ReopenDailyClosingDto,
  UpdateDailyClosingDto,
} from './dto/daily-closing.dto';
import { DailyClosingStatus } from './schemas/daily-closing.schema';

const DAILY_CLOSING_ROLES = [
  Role.PlatformAdmin,
  Role.SuperAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
];

@Controller('daily-closings')
@RequireModule(DAILY_CLOSING_MODULE_KEY)
@UseGuards(JwtAuthGuard, ModuleEnabledGuard, RolesGuard, PermissionsGuard)
@Roles(...DAILY_CLOSING_ROLES)
export class DailyClosingsController {
  constructor(private readonly dailyClosingsService: DailyClosingsService) {}

  @Get()
  @Permissions('dailyClosings.view')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('date') date?: string,
    @Query('status') status?: DailyClosingStatus,
  ) {
    return this.dailyClosingsService.findAll(user, {
      locationId,
      date,
      status,
    });
  }

  @Get('location/:locationId/date/:date')
  @Permissions('dailyClosings.view')
  findByLocationAndDate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('locationId') locationId: string,
    @Param('date') date: string,
  ) {
    return this.dailyClosingsService.findByLocationAndDate(
      user,
      locationId,
      date,
    );
  }

  @Get(':id/audit')
  @Permissions('dailyClosings.view')
  audit(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.dailyClosingsService.auditLog(id, user);
  }

  @Post('generate')
  @Permissions('dailyClosings.manage')
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateDailyClosingDto,
  ) {
    return this.dailyClosingsService.generate(dto, user);
  }

  @Patch(':id')
  @Permissions('dailyClosings.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDailyClosingDto,
  ) {
    return this.dailyClosingsService.update(id, dto, user);
  }

  @Patch(':id/complete')
  @Permissions('dailyClosings.manage')
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CompleteDailyClosingDto,
  ) {
    return this.dailyClosingsService.complete(id, dto, user);
  }

  @Patch(':id/reopen')
  @Permissions('dailyClosings.reopen')
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReopenDailyClosingDto,
  ) {
    return this.dailyClosingsService.reopen(id, dto, user);
  }

  @Patch(':id/lock')
  @Permissions('dailyClosings.lock')
  lock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: LockDailyClosingDto,
  ) {
    return this.dailyClosingsService.lock(id, dto, user);
  }

  @Get(':id')
  @Permissions('dailyClosings.view')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.dailyClosingsService.findOne(id, user);
  }
}
