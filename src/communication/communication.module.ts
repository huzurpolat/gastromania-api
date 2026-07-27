import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { CommunicationController } from './communication.controller';
import { CommunicationService } from './communication.service';
import {
  CommunicationProvider,
  CommunicationProviderSchema,
} from './schemas/communication-provider.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: CommunicationProvider.name, schema: CommunicationProviderSchema },
    ]),
  ],
  controllers: [CommunicationController],
  providers: [CommunicationService],
  exports: [CommunicationService],
})
export class CommunicationModule {}
