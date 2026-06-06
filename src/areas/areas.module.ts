import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { AreaGuard } from '../auth/guards/area.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import { City, CitySchema } from '../cities/schemas/city.schema';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { Region, RegionSchema } from '../regions/schemas/region.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AreasController } from './areas.controller';
import { AreasService } from './areas.service';
import { Area, AreaSchema } from './schemas/area.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Area.name, schema: AreaSchema },
      { name: City.name, schema: CitySchema },
      { name: Location.name, schema: LocationSchema },
      { name: Region.name, schema: RegionSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AreasController],
  providers: [AreasService, TenantGuard, AreaGuard],
  exports: [AreasService],
})
export class AreasModule {}
