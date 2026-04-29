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
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  create(@Body() createReservationDto: CreateReservationDto) {
    return this.reservationsService.create(createReservationDto);
  }

  @Get()
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  findAll(
    @Query('locationId') locationId?: string,
    @Query('tableId') tableId?: string,
  ) {
    return this.reservationsService.findAll({ locationId, tableId });
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  findOne(@Param('id') id: string) {
    return this.reservationsService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  update(
    @Param('id') id: string,
    @Body() updateReservationDto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(id, updateReservationDto);
  }

  @Delete(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  remove(@Param('id') id: string) {
    return this.reservationsService.remove(id);
  }
}
