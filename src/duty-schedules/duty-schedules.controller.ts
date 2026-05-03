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
import { CreateDutyShiftDto } from './dto/create-duty-shift.dto';
import { UpdateDutyShiftDto } from './dto/update-duty-shift.dto';
import { DutySchedulesService } from './duty-schedules.service';

@Controller('duty-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DutySchedulesController {
  constructor(private readonly dutySchedulesService: DutySchedulesService) {}

  @Post()
  @Roles(Role.Admin, Role.Filialleiter)
  create(
    @Body() createDutyShiftDto: CreateDutyShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dutySchedulesService.create(createDutyShiftDto, user);
  }

  @Get()
  @Roles(Role.Admin, Role.Filialleiter, Role.Service, Role.Kueche)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.dutySchedulesService.findAll(user, { locationId, start, end });
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  update(
    @Param('id') id: string,
    @Body() updateDutyShiftDto: UpdateDutyShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dutySchedulesService.update(id, updateDutyShiftDto, user);
  }

  @Delete(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.dutySchedulesService.remove(id, user);
  }
}
