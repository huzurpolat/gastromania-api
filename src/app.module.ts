import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationsModule } from './locations/locations.module';

@Module({
  imports: [
    // .env aktivieren
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // MongoDB Atlas Verbindung
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),

    // Feature Module
    LocationsModule,
  ],

  // ❌ später meist nicht mehr nötig
  controllers: [],

  // ❌ später meist nicht mehr nötig
  providers: [],
})
export class AppModule {}