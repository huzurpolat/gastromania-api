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
import { STAFF_MANAGEMENT_MODULE_KEY } from '../modules/constants/module-definitions';
import { RequireModule } from '../modules/decorators/require-module.decorator';
import { ModuleEnabledGuard } from '../modules/guards/module-enabled.guard';
import {
  CreateApplicantDto,
  CreateEmployeeDocumentDto,
  CreateFeedbackDto,
  UpdateApplicantDto,
  UpdateEmployeeDocumentDto,
  UpdateFeedbackDto,
} from './dto/hr.dto';
import { HrService } from './hr.service';

const hrRoles = [
  Role.TenantAdminCode,
  Role.CompanyAdmin,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.Personalabteilung,
];

@Controller('hr')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@Roles(...hrRoles)
@RequireModule(STAFF_MANAGEMENT_MODULE_KEY)
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Get('summary')
  @Permissions('hrDocuments.view', 'recruiting.view', 'feedback.view')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.hrService.summary(user, locationId);
  }

  @Get('export')
  @Permissions('reports.export')
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
  ) {
    return this.hrService.export(user, locationId);
  }

  @Get('documents')
  @Permissions('hrDocuments.view')
  findDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId?: string,
    @Query('locationId') locationId?: string,
    @Query('category') category?: string,
  ) {
    return this.hrService.findDocuments(user, {
      employeeId,
      locationId,
      category,
    });
  }

  @Post('documents')
  @Permissions('hrDocuments.create')
  createDocument(
    @Body() payload: CreateEmployeeDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hrService.createDocument(payload, user);
  }

  @Patch('documents/:id')
  @Permissions('hrDocuments.update')
  updateDocument(
    @Param('id') id: string,
    @Body() payload: UpdateEmployeeDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hrService.updateDocument(id, payload, user);
  }

  @Delete('documents/:id')
  @Permissions('hrDocuments.delete')
  removeDocument(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hrService.removeDocument(id, user);
  }

  @Get('applicants')
  @Permissions('recruiting.view')
  findApplicants(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.hrService.findApplicants(user, { locationId, status, search });
  }

  @Post('applicants')
  @Permissions('recruiting.create')
  createApplicant(
    @Body() payload: CreateApplicantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hrService.createApplicant(payload, user);
  }

  @Patch('applicants/:id')
  @Permissions('recruiting.update')
  updateApplicant(
    @Param('id') id: string,
    @Body() payload: UpdateApplicantDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hrService.updateApplicant(id, payload, user);
  }

  @Get('feedback')
  @Permissions('feedback.view')
  findFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Query('employeeId') employeeId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.hrService.findFeedback(user, { employeeId, locationId });
  }

  @Post('feedback')
  @Permissions('feedback.create')
  createFeedback(
    @Body() payload: CreateFeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hrService.createFeedback(payload, user);
  }

  @Patch('feedback/:id')
  @Permissions('feedback.update')
  updateFeedback(
    @Param('id') id: string,
    @Body() payload: UpdateFeedbackDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hrService.updateFeedback(id, payload, user);
  }
}
