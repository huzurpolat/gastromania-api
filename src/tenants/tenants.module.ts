import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { AreasModule } from '../areas/areas.module';
import { AuditLog, AuditLogSchema } from '../audit-logs/schemas/audit-log.schema';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { LocationsModule } from '../locations/locations.module';
import { ModulesModule } from '../modules/modules.module';
import { RegionsModule } from '../regions/regions.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PlatformTenantsController } from './platform-tenants.controller';
import { TenantSelfController } from './tenant-self.controller';
import { Tenant, TenantSchema } from './schemas/tenant.schema';
import { TenantsService } from './tenants.service';

@Module({
  imports: [
    AuthJwtModule,
    AreasModule,
    RegionsModule,
    LocationsModule,
    UsersModule,
    ModulesModule,
    MongooseModule.forFeature([
      { name: Tenant.name, schema: TenantSchema },
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [PlatformTenantsController, TenantSelfController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
