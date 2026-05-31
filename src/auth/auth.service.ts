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
import { CreateUserDto } from '../users/dto/create-user.dto';
import { toUserResponse, UserResponse } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { RbacService } from '../rbac/rbac.service';

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
    const user = await this.usersService.findByEmailWithPassword(
      loginDto.email,
    );

    if (!user) {
      throw new UnauthorizedException('E-Mail oder Passwort ist ungueltig');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Benutzer ist deaktiviert');
    }

    const passwordMatches = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('E-Mail oder Passwort ist ungueltig');
    }

    const permissions = await this.rbacService.permissionsForRoles(user.roles);
    const basePayload: AuthenticatedUser = {
      sub: user._id.toString(),
      email: user.email,
      roles: user.roles,
      permissions,
      companyId: user.companyId,
      regionIds: user.regionIds ?? [],
      locationIds: [
        ...new Set([
          ...(user.locationIds ?? []),
          ...(user.locationId ? [user.locationId] : []),
        ]),
      ],
      managedLocationIds: user.managedLocationIds ?? [],
      departmentIds: user.departmentIds ?? [],
    };
    const payload: AuthenticatedUser = {
      ...basePayload,
      locationIds: await this.accessPolicy.getReadableLocationIds(basePayload),
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        ...toUserResponse(user),
        permissions,
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
      [Role.Admin],
    );
  }
}
