import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { UsersModule } from '../users/users.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuthJwtModule } from './auth-jwt.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [AuthJwtModule, AuditLogsModule, UsersModule, RbacModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, AuthJwtModule],
})
export class AuthModule {}
