import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }]),
  ],
  controllers: [AuditLogsController],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AuditLogsModule {}
