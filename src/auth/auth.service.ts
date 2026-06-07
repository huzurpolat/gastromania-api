import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { AccessPolicyService } from '../access/access-policy.service';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser } from './types/authenticated-request.type';
import { Role } from './enums/role.enum';
import { isPlatformRole, normalizeRoles } from './role-utils';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UserResponse } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { RbacService } from '../rbac/rbac.service';
import { LOCATION_ROLE_PERMISSIONS } from '../rbac/permissions.catalog';

export interface LoginResponse {
  accessToken: string;
  user: UserResponse;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const email = loginDto.email.trim().toLowerCase();
    const password = loginDto.password.trim();
    const user = await this.usersService.findByEmailWithPassword(
      email,
    );

    if (!user) {
      throw new UnauthorizedException('E-Mail oder Passwort ist ungueltig');
    }

    if (!user.isActive || user.status === 'disabled') {
      throw new UnauthorizedException('Benutzer ist deaktiviert');
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('E-Mail oder Passwort ist ungueltig');
    }

    const roles = normalizeRoles(user.roles);
    const userResponse = await this.usersService.findById(user._id.toString());
    const locationAssignments = userResponse.locationAssignments ?? [];
    const locationRoles = [
      ...new Set(
        locationAssignments
          .map((assignment) => assignment.role)
          .filter(Boolean),
      ),
    ];
    const effectiveRoles = this.resolveEffectiveRoles(roles, locationRoles);
    const permissions = await this.resolvePermissions(roles, locationRoles);
    const basePayload: AuthenticatedUser = {
      sub: user._id.toString(),
      email: user.email,
      roles: effectiveRoles,
      permissions,
      permissionsVersion: Math.max(user.permissionsVersion ?? 1, 1),
      tenantId: user.tenantId,
      companyId: user.companyId,
      areaIds: user.areaIds ?? [],
      regionIds: user.regionIds ?? [],
      locationIds: [
        ...new Set([
          ...(user.locationIds ?? []),
          ...(user.locationId ? [user.locationId] : []),
        ]),
      ],
      primaryLocationId:
        locationAssignments.find((assignment) => assignment.isPrimary)
          ?.locationId ?? user.locationId,
      locationAssignments: locationAssignments.map((assignment) => ({
        locationId: assignment.locationId,
        role: assignment.role,
        isPrimary: assignment.isPrimary,
      })),
      managedLocationIds: user.managedLocationIds ?? [],
      departmentIds: user.departmentIds ?? [],
    };
    const payload: AuthenticatedUser = isPlatformRole(roles)
      ? {
          ...basePayload,
          tenantId: undefined,
          companyId: undefined,
          areaIds: [],
          regionIds: [],
          locationIds: [],
          primaryLocationId: undefined,
          locationAssignments: [],
          managedLocationIds: [],
          departmentIds: [],
        }
      : {
          ...basePayload,
          locationIds:
            await this.accessPolicy.getReadableLocationIds(basePayload),
        };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        ...userResponse,
        roles: effectiveRoles,
        permissions,
        permissionsVersion: payload.permissionsVersion,
        tenantId: payload.tenantId,
        locationId: payload.primaryLocationId,
        locationIds: payload.locationIds,
      },
    };
  }

  async bootstrapAdmin(createUserDto: CreateUserDto): Promise<UserResponse> {
    const userCount = await this.usersService.count();

    if (userCount > 0) {
      throw new ConflictException(
        'Bootstrap ist nur erlaubt, solange noch kein Benutzer existiert',
      );
    }

    return this.usersService.create(
      {
        ...createUserDto,
        isActive: true,
      },
      [Role.PlatformAdmin],
    );
  }

  private async resolvePermissions(
    roles: string[],
    locationRoles: string[],
  ): Promise<string[]> {
    if (isPlatformRole(roles) || this.hasTenantManagementRole(roles)) {
      return this.rbacService.permissionsForRoles(roles);
    }

    if (!locationRoles.length) {
      return this.rbacService.permissionsForRoles(roles);
    }

    const permissions = locationRoles.flatMap(
      (role) => LOCATION_ROLE_PERMISSIONS[role] ?? [],
    );

    return [...new Set(permissions)];
  }

  private resolveEffectiveRoles(roles: string[], locationRoles: string[]): string[] {
    if (isPlatformRole(roles) || this.hasTenantManagementRole(roles)) {
      return roles;
    }

    if (!locationRoles.length) {
      return roles;
    }

    return normalizeRoles([...roles, ...locationRoles]);
  }

  private hasTenantManagementRole(roles: string[]): boolean {
    const normalizedRoles = normalizeRoles(roles);

    return normalizedRoles.some((role) =>
      [
        Role.TenantAdmin,
        Role.RestaurantAdmin,
        Role.CompanyAdmin,
        Role.Admin,
        Role.RegionAdmin,
        Role.Regionalleiter,
        Role.Bereichsleiter,
        Role.Filialleiter,
        Role.Restaurantleiter,
        Role.Schichtleiter,
      ].includes(role as Role),
    );
  }
}
