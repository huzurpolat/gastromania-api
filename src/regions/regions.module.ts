import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { RegionGuard } from '../auth/guards/region.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { Region, RegionSchema } from './schemas/region.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Region.name, schema: RegionSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [RegionsController],
  providers: [RegionsService, TenantGuard, RegionGuard],
  exports: [RegionsService],
})
export class RegionsModule {}
