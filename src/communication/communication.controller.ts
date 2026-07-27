import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { CommunicationService } from './communication.service';
import {
  CreateCommunicationProviderDto,
  UpdateCommunicationProviderDto,
} from './dto/communication-provider.dto';

const COMMUNICATION_ROLES = [
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
  Role.Marketing,
];

@Controller('communication/providers')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class CommunicationController {
  constructor(private readonly communicationService: CommunicationService) {}

  @Get()
  @Permissions('reservations.view')
  @Roles(...COMMUNICATION_ROLES)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.communicationService.listProviders(user);
  }

  @Post()
  @Permissions('reservations.create')
  @Roles(...COMMUNICATION_ROLES)
  create(
    @Body() payload: CreateCommunicationProviderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.communicationService.createProvider(payload, user);
  }

  @Patch(':id')
  @Permissions('reservations.update')
  @Roles(...COMMUNICATION_ROLES)
  update(
    @Param('id') id: string,
    @Body() payload: UpdateCommunicationProviderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.communicationService.updateProvider(id, payload, user);
  }

  @Delete(':id')
  @Permissions('reservations.delete')
  @Roles(...COMMUNICATION_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.communicationService.deleteProvider(id, user);
  }
}
