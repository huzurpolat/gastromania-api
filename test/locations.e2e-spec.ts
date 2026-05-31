import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { LocationsController } from '../src/locations/locations.controller';
import { LocationsService } from '../src/locations/locations.service';

describe('LocationsController (e2e)', () => {
  let app: INestApplication<App>;

  const locationsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [LocationsController],
      providers: [
        {
          provide: LocationsService,
          useValue: locationsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /api/locations creates a location', async () => {
    const responseBody = {
      _id: '6627d9a2c6f2d8f3e2b1a001',
      name: 'Gastromania Mitte',
      street: 'Hauptstrasse 1',
      zip: '10115',
      city: 'Berlin',
      isActive: true,
    };

    locationsService.create.mockResolvedValue(responseBody);

    await request(app.getHttpServer())
      .post('/api/locations')
      .send({
        name: ' Gastromania Mitte ',
        street: ' Hauptstrasse 1 ',
        zip: '10115',
        city: ' Berlin ',
      })
      .expect(201)
      .expect(responseBody);

    expect(locationsService.create).toHaveBeenCalledWith({
      name: 'Gastromania Mitte',
      street: 'Hauptstrasse 1',
      zip: '10115',
      city: 'Berlin',
    }, undefined);
  });

  it('POST /api/locations rejects unknown properties', async () => {
    await request(app.getHttpServer())
      .post('/api/locations')
      .send({
        name: 'Gastromania Mitte',
        street: 'Hauptstrasse 1',
        zip: '10115',
        city: 'Berlin',
        unknown: 'nope',
      })
      .expect(400);
  });
});
