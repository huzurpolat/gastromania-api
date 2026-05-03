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
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { TimeTrackingService } from './time-tracking.service';

@Controller('time-tracking')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin, Role.Filialleiter, Role.Service, Role.Kueche, Role.Lager)
export class TimeTrackingController {
  constructor(private readonly timeTrackingService: TimeTrackingService) {}

  @Post('clock-in')
  clockIn(
    @Body() createTimeEntryDto: CreateTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.clockIn(createTimeEntryDto, user);
  }

  @Patch(':id/clock-out')
  clockOut(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.timeTrackingService.clockOut(id, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('open') open?: string,
  ) {
    return this.timeTrackingService.findAll(user, {
      locationId,
      employeeId,
      start,
      end,
      open,
    });
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  update(
    @Param('id') id: string,
    @Body() updateTimeEntryDto: UpdateTimeEntryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.timeTrackingService.update(id, updateTimeEntryDto, user);
  }

  @Delete(':id')
  @Roles(Role.Admin, Role.Filialleiter)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.timeTrackingService.remove(id, user);
  }
}
