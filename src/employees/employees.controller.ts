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
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { UserResponse } from '../users/schemas/user.schema';
import {
  EmployeeExport,
  EmployeeFilters,
  EmployeesService,
} from './employees.service';

const employeeRoles = [
  Role.TenantAdminCode,
  Role.CompanyAdmin,
  Role.AreaManager,
  Role.RegionalManager,
  Role.RegionAdmin,
  Role.Admin,
  Role.Regionalleiter,
  Role.Bereichsleiter,
  Role.LocationManager,
  Role.Filialleiter,
  Role.Restaurantleiter,
  Role.Schichtleiter,
  Role.Personalabteilung,
];

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@Roles(...employeeRoles)
@RequireModule(STAFF_MANAGEMENT_MODULE_KEY)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Permissions('employees.create')
  create(
    @Body() payload: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.employeesService.create(payload, user);
  }

  @Get()
  @Permissions('employees.view')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('qualification') qualification?: string,
    @Query('role') role?: string,
    @Query('employmentType') employmentType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
  ): Promise<UserResponse[]> {
    const filters: EmployeeFilters = {
      locationId,
      departmentId,
      qualification,
      role,
      employmentType,
      status,
      search,
      active,
    };
    return this.employeesService.findAll(user, filters);
  }

  @Get('export')
  @Permissions('employees.export')
  export(
    @CurrentUser() user: AuthenticatedUser,
    @Query('locationId') locationId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('qualification') qualification?: string,
    @Query('role') role?: string,
    @Query('employmentType') employmentType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('active') active?: string,
    @Query('format') format?: 'csv' | 'xlsx',
  ): Promise<EmployeeExport> {
    return this.employeesService.export(user, {
      locationId,
      departmentId,
      qualification,
      role,
      employmentType,
      status,
      search,
      active,
      format,
    });
  }

  @Get(':id')
  @Permissions('employees.view')
  findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.employeesService.findById(id, user);
  }

  @Patch(':id')
  @Permissions('employees.update')
  update(
    @Param('id') id: string,
    @Body() payload: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.employeesService.update(id, payload, user);
  }

  @Delete(':id')
  @Permissions('employees.delete')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.employeesService.remove(id, user);
  }
}
