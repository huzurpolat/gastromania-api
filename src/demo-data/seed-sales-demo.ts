import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DemoDataService } from './demo-data.service';

async function seedSalesDemo() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const demoDataService = app.get(DemoDataService);
    const result = await demoDataService.seedSalesDemo();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

void seedSalesDemo();
