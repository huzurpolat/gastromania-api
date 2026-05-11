import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { Location, LocationSchema } from '../locations/schemas/location.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';
import { Checklist, ChecklistSchema } from './schemas/checklist.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([
      { name: Checklist.name, schema: ChecklistSchema },
      { name: User.name, schema: UserSchema },
      { name: Location.name, schema: LocationSchema },
    ]),
  ],
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
})
export class ChecklistsModule {}
