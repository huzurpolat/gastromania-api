import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser } from './types/authenticated-request.type';
import { Role } from './enums/role.enum';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { toUserResponse, UserResponse } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';

export interface LoginResponse {
  accessToken: string;
  user: UserResponse;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
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

    const payload: AuthenticatedUser = {
      sub: user._id.toString(),
      email: user.email,
      roles: user.roles,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: toUserResponse(user),
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
