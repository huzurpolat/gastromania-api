import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { InternalMessagesController } from './internal-messages.controller';
import { InternalMessagesService } from './internal-messages.service';
import {
  InternalMessage,
  InternalMessageSchema,
} from './schemas/internal-message.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: InternalMessage.name, schema: InternalMessageSchema },
      { name: User.name, schema: UserSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
  ],
  controllers: [InternalMessagesController],
  providers: [InternalMessagesService],
})
export class InternalMessagesModule {}
