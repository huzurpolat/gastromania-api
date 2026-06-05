import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { AuditLog, AuditLogSchema } from '../audit-logs/schemas/audit-log.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import {
  UserLocationAssignment,
  UserLocationAssignmentSchema,
} from './schemas/user-location-assignment.schema';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Location.name, schema: LocationSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      {
        name: UserLocationAssignment.name,
        schema: UserLocationAssignmentSchema,
      },
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService, TenantGuard],
  exports: [UsersService],
})
export class UsersModule {}
