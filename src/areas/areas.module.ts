import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { AreaGuard } from '../auth/guards/area.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import { Area, AreaSchema } from './schemas/area.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Area.name, schema: AreaSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [AreasController],
  providers: [AreasService, TenantGuard, AreaGuard],
  exports: [AreasService],
})
export class AreasModule {}
