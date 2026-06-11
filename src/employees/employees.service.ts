import { Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { UserResponse } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';

export interface EmployeeFilters {
  locationId?: string;
  departmentId?: string;
  qualification?: string;
  role?: string;
  employmentType?: string;
  status?: string;
  search?: string;
  active?: string;
}

export interface EmployeeExport {
  filename: string;
  mimeType: string;
  content: string;
}

@Injectable()
export class EmployeesService {
  constructor(private readonly usersService: UsersService) {}

  create(
    payload: CreateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.create(payload, undefined, actor);
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: EmployeeFilters = {},
  ): Promise<UserResponse[]> {
    const users = await this.usersService.findAll(actor);

    return users.filter((user) => {
      const locationIds = [
        user.locationId,
        ...(user.locationIds ?? []),
        ...(user.managedLocationIds ?? []),
        ...(user.locationAssignments?.map(
          (assignment) => assignment.locationId,
        ) ?? []),
      ].filter(Boolean);
      const assignmentRoles =
        user.locationAssignments
          ?.map((assignment) => assignment.role)
          .filter((role): role is string => Boolean(role)) ?? [];
      const departmentIds = [
        ...new Set(
          [user.departmentId, ...(user.departmentIds ?? [])].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ];
      const qualifications = user.qualifications ?? [];
      const searchable = [
        user.employeeNumber,
        user.firstName,
        user.lastName,
        user.email,
        user.phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const search = filters.search?.toLowerCase();

      return (
        (!filters.locationId || locationIds.includes(filters.locationId)) &&
        (!filters.departmentId ||
          departmentIds.includes(filters.departmentId)) &&
        (!filters.qualification ||
          qualifications.includes(filters.qualification) ||
          user.roles.includes(filters.qualification)) &&
        (!filters.role ||
          user.roles.includes(filters.role) ||
          assignmentRoles.includes(filters.role)) &&
        (!filters.employmentType ||
          user.employmentType === filters.employmentType ||
          user.contractType === filters.employmentType) &&
        (!filters.status || user.employeeStatus === filters.status) &&
        (!search || searchable.includes(search)) &&
        (filters.active === undefined ||
          user.isActive === (filters.active === 'true'))
      );
    });
  }

  async export(
    actor: AuthenticatedUser,
    filters: EmployeeFilters & { format?: 'csv' | 'xlsx' } = {},
  ): Promise<EmployeeExport> {
    const employees = await this.findAll(actor, filters);
    const rows = [
      [
        'Personalnummer',
        'Vorname',
        'Nachname',
        'E-Mail',
        'Telefon',
        'Standort',
        'Arbeitsbereich',
        'Rollen',
        'Anstellungstyp',
        'Wochenstunden',
        'Stundenlohn',
        'Resturlaub',
        'Status',
      ],
      ...employees.map((employee) => [
        employee.employeeNumber ?? '',
        employee.firstName ?? '',
        employee.lastName ?? '',
        employee.email,
        employee.phone ?? '',
        employee.locationId ?? '',
        employee.department ?? '',
        employee.roles.join(', '),
        employee.employmentType ?? employee.contractType ?? '',
        employee.weeklyHours ?? '',
        employee.hourlyRate ?? '',
        employee.remainingVacationDays ?? '',
        employee.employeeStatus ??
          (employee.isActive === false ? 'Inaktiv' : 'Frei'),
      ]),
    ];

    if (filters.format === 'xlsx') {
      return {
        filename: 'gastromania-employees.xls',
        mimeType: 'application/vnd.ms-excel',
        content: this.toExcelXml(rows),
      };
    }

    return {
      filename: 'gastromania-employees.csv',
      mimeType: 'text/csv; charset=utf-8',
      content: this.toCsv(rows),
    };
  }

  findById(id: string, actor: AuthenticatedUser): Promise<UserResponse> {
    return this.usersService.findById(id, actor);
  }

  update(
    id: string,
    payload: UpdateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    return this.usersService.update(id, payload, actor);
  }

  remove(id: string, actor: AuthenticatedUser): Promise<void> {
    return this.usersService.remove(id, actor);
  }

  private toCsv(rows: unknown[][]): string {
    return rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'),
      )
      .join('\n');
  }

  private toExcelXml(rows: unknown[][]): string {
    const body = rows
      .map(
        (row) =>
          `<Row>${row
            .map((cell) => {
              const value = String(cell)
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;');
              return `<Cell><Data ss:Type="String">${value}</Data></Cell>`;
            })
            .join('')}</Row>`,
      )
      .join('');

    return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Employees"><Table>${body}</Table></Worksheet>
</Workbook>`;
  }
}
