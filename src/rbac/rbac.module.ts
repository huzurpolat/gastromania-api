import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AuditController } from './audit.controller';
import { PermissionsController } from './permissions.controller';
import { RbacService } from './rbac.service';
import { RolesController } from './roles.controller';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { ManagedRole, ManagedRoleSchema } from './schemas/role.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: ManagedRole.name, schema: ManagedRoleSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [RolesController, PermissionsController, AuditController],
  providers: [RbacService],
  exports: [RbacService],
})
export class RbacModule {}
