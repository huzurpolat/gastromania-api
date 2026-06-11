import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from '../audit-logs/schemas/audit-log.schema';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  DepartmentsController,
  TenantDepartmentsController,
} from './departments.controller';
import { DepartmentsService } from './departments.service';
import { Department, DepartmentSchema } from './schemas/department.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Department.name, schema: DepartmentSchema },
      { name: User.name, schema: UserSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [DepartmentsController, TenantDepartmentsController],
  providers: [DepartmentsService],
})
export class DepartmentsModule {}
