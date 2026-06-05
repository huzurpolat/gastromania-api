import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import { ModulesStatusController } from './modules-status.controller';
import { ModulesService } from './modules.service';
import { ModuleEnabledGuard } from './guards/module-enabled.guard';
import {
  SystemModule,
  SystemModuleSchema,
} from './schemas/system-module.schema';
import {
  TenantModule,
  TenantModuleSchema,
} from './schemas/tenant-module.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: SystemModule.name, schema: SystemModuleSchema },
      { name: TenantModule.name, schema: TenantModuleSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [ModulesStatusController],
  providers: [ModulesService, ModuleEnabledGuard],
  exports: [ModulesService, ModuleEnabledGuard],
})
export class ModulesModule {}
