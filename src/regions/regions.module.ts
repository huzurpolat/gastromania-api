import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthJwtModule } from '../auth/auth-jwt.module';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { Region, RegionSchema } from './schemas/region.schema';

@Module({
  imports: [
    AuthJwtModule,
    MongooseModule.forFeature([{ name: Region.name, schema: RegionSchema }]),
  ],
  controllers: [RegionsController],
  providers: [RegionsService],
})
export class RegionsModule {}
