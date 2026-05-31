import {
  Body,
  Controller,
  Get,
  MessageEvent,
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
import { CreateInternalMessageDto } from './dto/create-internal-message.dto';
import {
  InternalMessageResponse,
  InternalMessagesService,
} from './internal-messages.service';

@Controller('internal-messages')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class InternalMessagesController {
  constructor(private readonly messagesService: InternalMessagesService) {}

  @Post()
  @Permissions('internalMessages.create')
  @Roles(Role.Admin, Role.Filialleiter, Role.Service)
  create(
    @Body() payload: CreateInternalMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InternalMessageResponse> {
    return this.messagesService.create(payload, user);
  }

  @Get()
  @Permissions('internalMessages.view')
  @Roles(Role.Admin, Role.Filialleiter, Role.Service, Role.Kueche, Role.Lager, Role.Tellerwaescher)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ): Promise<InternalMessageResponse[]> {
    return this.messagesService.findAll(user, locationId);
  }

  @Sse('stream')
  @Permissions('internalMessages.view')
  @Roles(Role.Admin, Role.Filialleiter, Role.Service, Role.Kueche, Role.Lager, Role.Tellerwaescher)
  stream(
    @CurrentUser() user: AuthenticatedUser,
  ): Observable<MessageEvent> {
    return this.messagesService.stream(user);
  }
}
