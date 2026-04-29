import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AuthJwtModule } from './auth-jwt.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [AuthJwtModule, UsersModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, AuthJwtModule],
})
export class AuthModule {}
