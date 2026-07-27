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
import { ConvertWaitlistEntryDto } from './dto/convert-waitlist-entry.dto';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';
import { UpdateWaitlistEntryDto } from './dto/update-waitlist-entry.dto';
import { WaitlistStatus } from './schemas/waitlist-entry.schema';
import { WaitlistService } from './waitlist.service';

const WAITLIST_ROLES = [
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

@Controller('waitlist')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @Permissions('reservations.create')
  @Roles(...WAITLIST_ROLES)
  create(
    @Body() payload: CreateWaitlistEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.waitlistService.create(payload, user);
  }

  @Get()
  @Permissions('reservations.view')
  @Roles(...WAITLIST_ROLES)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('status') status?: WaitlistStatus,
  ) {
    return this.waitlistService.findAll(user, { locationId, status });
  }

  @Get(':id')
  @Permissions('reservations.view')
  @Roles(...WAITLIST_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.waitlistService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('reservations.update')
  @Roles(...WAITLIST_ROLES)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateWaitlistEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.waitlistService.update(id, payload, user);
  }

  @Patch(':id/notify')
  @Permissions('reservations.update')
  @Roles(...WAITLIST_ROLES)
  notify(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.waitlistService.notify(id, user);
  }

  @Patch(':id/seat')
  @Permissions('reservations.update')
  @Roles(...WAITLIST_ROLES)
  seat(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.waitlistService.seat(id, user);
  }

  @Patch(':id/no-show')
  @Permissions('reservations.update')
  @Roles(...WAITLIST_ROLES)
  markNoShow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.waitlistService.markNoShow(id, user);
  }

  @Patch(':id/reservation')
  @Permissions('reservations.create')
  @Roles(...WAITLIST_ROLES)
  convertToReservation(
    @Param('id') id: string,
    @Body() payload: ConvertWaitlistEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.waitlistService.convertToReservation(id, payload, user);
  }

  @Patch('actions/mark-available')
  @Permissions('reservations.update')
  @Roles(...WAITLIST_ROLES)
  markAvailableCandidates(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.waitlistService.markAvailableCandidates(user, locationId);
  }

  @Delete(':id')
  @Permissions('reservations.delete')
  @Roles(...WAITLIST_ROLES)
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.waitlistService.cancel(id, user);
  }
}
