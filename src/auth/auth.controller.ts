import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UserResponse } from '../users/schemas/user.schema';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthService, LoginResponse } from './auth.service';
import type { AuthenticatedUser } from './types/authenticated-request.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post('login')
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
  ): Promise<LoginResponse> {
    const email = loginDto.email.trim().toLowerCase();

    try {
      const response = await this.authService.login(loginDto);
      await this.auditLogService.logSuccess({
        actorUserId: response.user._id,
        actorEmail: response.user.email,
        actorRole: response.user.roles?.[0] ?? response.user.role ?? 'unknown',
        tenantId: response.user.tenantId,
        action: 'LOGIN_SUCCESS',
        category: 'SYSTEM',
        entityType: 'auth',
        entityId: response.user._id,
        entityName: response.user.email,
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
      });
      return response;
    } catch (error) {
      await this.auditLogService.logFailure({
        actorUserId: 'anonymous',
        actorEmail: email,
        actorRole: 'anonymous',
        action: 'LOGIN_FAILED',
        category: 'SYSTEM',
        entityType: 'auth',
        entityId: email,
        entityName: email,
        ipAddress: request.ip,
        userAgent: request.get('user-agent'),
      });
      throw error;
    }
  }

  @Post('bootstrap-admin')
  bootstrapAdmin(@Body() createUserDto: CreateUserDto): Promise<UserResponse> {
    return this.authService.bootstrapAdmin(createUserDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
