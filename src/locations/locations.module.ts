import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { LocationGuard } from '../auth/guards/location.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import {
  RestaurantTable,
  RestaurantTableSchema,
} from '../tables/schemas/table.schema';
import { Tenant, TenantSchema } from '../tenants/schemas/tenant.schema';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { Location, LocationSchema } from './schemas/location.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Location.name, schema: LocationSchema },
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
      { name: Tenant.name, schema: TenantSchema },
    ]),
  ],
  controllers: [LocationsController],
  providers: [LocationsService, TenantGuard, LocationGuard],
  exports: [LocationsService],
})
export class LocationsModule {}
