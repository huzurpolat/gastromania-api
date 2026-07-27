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
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationsService } from './reservations.service';
import { ReservationStatus } from './schemas/reservation.schema';

const RESERVATION_ROLES = [
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

const RESERVATION_MANAGER_ROLES = [
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
];

@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @Permissions('reservations.create')
  @Roles(...RESERVATION_ROLES)
  create(
    @Body() createReservationDto: CreateReservationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservationsService.create(createReservationDto, user);
  }

  @Get()
  @Permissions('reservations.view')
  @Roles(...RESERVATION_ROLES)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('tableId') tableId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('status') status?: ReservationStatus,
  ) {
    return this.reservationsService.findAll(user, {
      locationId,
      tableId,
      dateFrom,
      dateTo,
      status,
    });
  }

  @Get(':id')
  @Permissions('reservations.view')
  @Roles(...RESERVATION_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservationsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('reservations.update')
  @Roles(...RESERVATION_ROLES)
  update(
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservationsService.update(id, updateReservationDto, user);
  }

  @Patch(':id/check-in')
  @Permissions('reservations.update')
  @Roles(...RESERVATION_ROLES)
  checkIn(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservationsService.checkIn(id, user);
  }

  @Patch(':id/complete')
  @Permissions('reservations.update')
  @Roles(...RESERVATION_ROLES)
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservationsService.complete(id, user);
  }

  @Patch(':id/no-show')
  @Permissions('reservations.update')
  @Roles(...RESERVATION_ROLES)
  markNoShow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservationsService.markNoShow(id, user);
  }

  @Delete(':id')
  @Permissions('reservations.delete')
  @Roles(...RESERVATION_MANAGER_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservationsService.remove(id, user);
  }
}
