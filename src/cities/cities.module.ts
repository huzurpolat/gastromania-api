import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Area, AreaSchema } from '../areas/schemas/area.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { Region, RegionSchema } from '../regions/schemas/region.schema';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import { CitiesController } from './cities.controller';
import { CitiesService } from './cities.service';
import { City, CitySchema } from './schemas/city.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Area.name, schema: AreaSchema },
      { name: City.name, schema: CitySchema },
      { name: Location.name, schema: LocationSchema },
      { name: Region.name, schema: RegionSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [CitiesController],
  providers: [CitiesService, TenantGuard],
  exports: [CitiesService],
})
export class CitiesModule {}
