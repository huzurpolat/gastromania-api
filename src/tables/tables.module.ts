import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { RestaurantTable, RestaurantTableSchema } from './schemas/table.schema';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: RestaurantTable.name, schema: RestaurantTableSchema },
    ]),
  ],
  controllers: [TablesController],
  providers: [TablesService],
})
export class TablesModule {}
