import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { WeeklyMenu, WeeklyMenuSchema } from './schemas/weekly-menu.schema';
import { WeeklyMenusController } from './weekly-menus.controller';
import { WeeklyMenusService } from './weekly-menus.service';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: WeeklyMenu.name, schema: WeeklyMenuSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
  ],
  controllers: [WeeklyMenusController],
  providers: [WeeklyMenusService],
})
export class WeeklyMenusModule {}
