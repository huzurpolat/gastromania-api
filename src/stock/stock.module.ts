import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { StockItem, StockItemSchema } from './schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementSchema,
} from './schemas/stock-movement.schema';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: User.name, schema: UserSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
  ],
  controllers: [StockController],
  providers: [StockService],
})
export class StockModule {}
