import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { ChecklistsService } from './checklists.service';
import { CreateChecklistDto } from './dto/create-checklist.dto';
import { ToggleChecklistTaskDto } from './dto/toggle-checklist-task.dto';
import { UpdateChecklistDto } from './dto/update-checklist.dto';

@Controller('checklists')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles(
  Role.PlatformAdmin,
  Role.SuperAdmin,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Service,
  Role.Kueche,
  Role.Lager,
  Role.Tellerwaescher,
)
export class ChecklistsController {
  constructor(private readonly checklistsService: ChecklistsService) {}

  @Post()
  @Permissions('tasks.create')
  create(
    @Body() payload: CreateChecklistDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checklistsService.create(payload, user);
  }

  @Get()
  @Permissions('tasks.view')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('date') date?: string,
  ) {
    return this.checklistsService.findAll(user, locationId, date);
  }

  @Patch(':id')
  @Permissions('tasks.update')
  update(
    @Param('id') id: string,
    @Body() payload: UpdateChecklistDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checklistsService.update(id, payload, user);
  }

  @Patch(':id/tasks/:taskId')
  @Permissions('tasks.update')
  toggleTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() payload: ToggleChecklistTaskDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.checklistsService.toggleTask(id, taskId, payload, user);
  }

  @Delete(':id')
  @Permissions('tasks.delete')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.checklistsService.remove(id, user);
  }

  @Sse('stream')
  @Permissions('tasks.view')
  stream(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('date') date?: string,
  ): Observable<MessageEvent> {
    return this.checklistsService.stream(user, locationId, date);
  }
}
