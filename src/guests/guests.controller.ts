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
import { CreateGuestProfileDto } from './dto/create-guest-profile.dto';
import { UpdateGuestProfileDto } from './dto/update-guest-profile.dto';
import { GuestsService } from './guests.service';

const GUEST_ROLES = [
  Role.TenantAdminCode,
  Role.TenantAdmin,
  Role.RestaurantAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Service,
];

@Controller('guests')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Get()
  @Permissions('reservations.view')
  @Roles(...GUEST_ROLES)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('search') search?: string,
  ) {
    return this.guestsService.findAll(user, { locationId, search });
  }

  @Post()
  @Permissions('reservations.create')
  @Roles(...GUEST_ROLES)
  create(
    @Body() payload: CreateGuestProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.guestsService.create(payload, user);
  }

  @Get(':id')
  @Permissions('reservations.view')
  @Roles(...GUEST_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.guestsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('reservations.update')
  @Roles(...GUEST_ROLES)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateGuestProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.guestsService.update(id, payload, user);
  }

  @Delete(':id')
  @Permissions('reservations.delete')
  @Roles(...GUEST_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.guestsService.remove(id, user);
  }

  @Get(':id/history')
  @Permissions('reservations.view')
  @Roles(...GUEST_ROLES)
  history(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.guestsService.history(id, user);
  }

  @Get(':id/analytics')
  @Permissions('reservations.view')
  @Roles(...GUEST_ROLES)
  analytics(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.guestsService.analytics(id, user);
  }
}
