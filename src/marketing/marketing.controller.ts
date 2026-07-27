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
import {
  CreateMarketingCampaignDto,
  UpdateMarketingCampaignDto,
} from './dto/marketing-campaign.dto';
import {
  CreateMarketingAutomationDto,
  UpdateMarketingAutomationDto,
} from './dto/marketing-automation.dto';
import {
  CreateCampaignTemplateDto,
  UpdateCampaignTemplateDto,
} from './dto/campaign-template.dto';
import {
  PrepareCampaignDeliveryDto,
  SendCampaignTestDto,
} from './dto/campaign-delivery.dto';
import { MarketingAutomationService } from './marketing-automation.service';
import { MarketingService } from './marketing.service';

const MARKETING_ROLES = [
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
  Role.Schichtleiter,
  Role.Marketing,
];

@Controller('marketing')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MarketingController {
  constructor(
    private readonly marketingService: MarketingService,
    private readonly automationService: MarketingAutomationService,
  ) {}

  @Get('campaigns')
  @Permissions('reservations.view')
  @Roles(...MARKETING_ROLES)
  campaigns(@CurrentUser() user: AuthenticatedUser) {
    return this.marketingService.listCampaigns(user);
  }

  @Post('campaigns')
  @Permissions('reservations.create')
  @Roles(...MARKETING_ROLES)
  createCampaign(
    @Body() payload: CreateMarketingCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingService.createCampaign(payload, user);
  }

  @Patch('campaigns/:id')
  @Permissions('reservations.update')
  @Roles(...MARKETING_ROLES)
  updateCampaign(
    @Param('id') id: string,
    @Body() payload: UpdateMarketingCampaignDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingService.updateCampaign(id, payload, user);
  }

  @Delete('campaigns/:id')
  @Permissions('reservations.delete')
  @Roles(...MARKETING_ROLES)
  archiveCampaign(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingService.archiveCampaign(id, user);
  }

  @Post('campaigns/:id/prepare-delivery')
  @Permissions('reservations.update')
  @Roles(...MARKETING_ROLES)
  prepareDelivery(
    @Param('id') id: string,
    @Body() payload: PrepareCampaignDeliveryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingService.prepareDelivery(id, payload, user);
  }

  @Post('campaigns/:id/send-test')
  @Permissions('reservations.update')
  @Roles(...MARKETING_ROLES)
  sendTest(
    @Param('id') id: string,
    @Body() payload: SendCampaignTestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingService.sendTest(id, payload, user);
  }

  @Post('campaigns/:id/send')
  @Permissions('reservations.update')
  @Roles(...MARKETING_ROLES)
  send(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingService.sendCampaign(id, user);
  }

  @Get('campaigns/:id/messages')
  @Permissions('reservations.view')
  @Roles(...MARKETING_ROLES)
  messages(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingService.getCampaignMessages(id, user);
  }

  @Get('segments')
  @Permissions('reservations.view')
  @Roles(...MARKETING_ROLES)
  segments(@CurrentUser() user: AuthenticatedUser) {
    return this.marketingService.listSegments(user);
  }

  @Get('segments/:id/preview')
  @Permissions('reservations.view')
  @Roles(...MARKETING_ROLES)
  previewSegment(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingService.previewSegment(id, user);
  }

  @Get('guests/:guestId/history')
  @Permissions('reservations.view')
  @Roles(...MARKETING_ROLES)
  guestHistory(
    @Param('guestId') guestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marketingService.guestMarketingHistory(guestId, user);
  }

  @Get('automations')
  @Permissions('reservations.view')
  @Roles(...MARKETING_ROLES)
  automations(@CurrentUser() user: AuthenticatedUser) {
    return this.automationService.listAutomations(user);
  }

  @Post('automations')
  @Permissions('reservations.create')
  @Roles(...MARKETING_ROLES)
  createAutomation(
    @Body() payload: CreateMarketingAutomationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.automationService.createAutomation(payload, user);
  }

  @Patch('automations/:id')
  @Permissions('reservations.update')
  @Roles(...MARKETING_ROLES)
  updateAutomation(
    @Param('id') id: string,
    @Body() payload: UpdateMarketingAutomationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.automationService.updateAutomation(id, payload, user);
  }

  @Delete('automations/:id')
  @Permissions('reservations.delete')
  @Roles(...MARKETING_ROLES)
  deleteAutomation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.automationService.deleteAutomation(id, user);
  }

  @Post('automations/:id/run')
  @Permissions('reservations.update')
  @Roles(...MARKETING_ROLES)
  runAutomation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.automationService.runAutomation(id, user);
  }

  @Get('templates')
  @Permissions('reservations.view')
  @Roles(...MARKETING_ROLES)
  templates(@CurrentUser() user: AuthenticatedUser) {
    return this.automationService.listTemplates(user);
  }

  @Post('templates')
  @Permissions('reservations.create')
  @Roles(...MARKETING_ROLES)
  createTemplate(
    @Body() payload: CreateCampaignTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.automationService.createTemplate(payload, user);
  }

  @Patch('templates/:id')
  @Permissions('reservations.update')
  @Roles(...MARKETING_ROLES)
  updateTemplate(
    @Param('id') id: string,
    @Body() payload: UpdateCampaignTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.automationService.updateTemplate(id, payload, user);
  }

  @Delete('templates/:id')
  @Permissions('reservations.delete')
  @Roles(...MARKETING_ROLES)
  deleteTemplate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.automationService.deleteTemplate(id, user);
  }
}
