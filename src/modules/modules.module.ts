import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { ModulesController } from './modules.controller';
import { ModulesStatusController } from './modules-status.controller';
import { ModulesService } from './modules.service';
import { ModuleEnabledGuard } from './guards/module-enabled.guard';
import {
  SystemModule,
  SystemModuleSchema,
} from './schemas/system-module.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: SystemModule.name, schema: SystemModuleSchema },
    ]),
  ],
  controllers: [ModulesController, ModulesStatusController],
  providers: [ModulesService, ModuleEnabledGuard],
  exports: [ModulesService, ModuleEnabledGuard],
})
export class ModulesModule {}
