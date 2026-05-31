import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

describe('Auth API prefix (e2e)', () => {
  let app: INestApplication<App>;

  const authService = {
    login: jest.fn(),
    bootstrapAdmin: jest.fn(),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
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

  it('POST /api/auth/login reaches the AuthController', async () => {
    const responseBody = {
      accessToken: 'e2e-token',
      user: {
        _id: '6627d9a2c6f2d8f3e2b1a050',
        name: 'Admin Gastro',
        email: 'admin@gastromania.local',
        role: 'Admin',
        locationIds: [],
      },
    };

    authService.login.mockResolvedValue(responseBody);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@gastromania.local',
        password: 'secret123',
      })
      .expect(201)
      .expect(responseBody);

    expect(authService.login).toHaveBeenCalledWith({
      email: 'admin@gastromania.local',
      password: 'secret123',
    });
  });

  it('does not expose auth routes without the /api prefix', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@gastromania.local',
        password: 'secret123',
      })
      .expect(404);
  });
});
