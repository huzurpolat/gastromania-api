import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';
import { LocationDocument } from './schemas/location.schema';

describe('LocationsController', () => {
  let controller: LocationsController;

  const location = {
    _id: '6627d9a2c6f2d8f3e2b1a001',
    name: 'Gastromania Mitte',
    street: 'Hauptstrasse 1',
    zip: '10115',
    city: 'Berlin',
    federalState: 'Berlin',
    isActive: true,
  } as unknown as LocationDocument;

  const locationsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const actor = {
    sub: 'user-admin',
    email: 'admin@nrw.local',
    roles: ['Admin'],
    regionIds: ['region-nrw'],
    locationIds: ['6627d9a2c6f2d8f3e2b1a001'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocationsController],
      providers: [
        {
          provide: LocationsService,
          useValue: locationsService,
        },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<LocationsController>(LocationsController);
    jest.clearAllMocks();
  });

  it('creates a location', async () => {
    const dto: CreateLocationDto = {
      name: 'Gastromania Mitte',
      street: 'Hauptstrasse 1',
      zip: '10115',
      city: 'Berlin',
      federalState: 'Berlin',
    };

    locationsService.create.mockResolvedValue(location);

    await expect(controller.create(dto, actor)).resolves.toBe(location);
    expect(locationsService.create).toHaveBeenCalledWith(dto, actor);
  });

  it('returns all locations', async () => {
    locationsService.findAll.mockResolvedValue([location]);

    await expect(controller.findAll(actor)).resolves.toEqual([location]);
  });

  it('returns one location', async () => {
    locationsService.findOne.mockResolvedValue(location);

    await expect(
      controller.findOne('6627d9a2c6f2d8f3e2b1a001', actor),
    ).resolves.toBe(location);
  });

  it('updates a location', async () => {
    const dto: UpdateLocationDto = {
      city: 'Hamburg',
      federalState: 'Hamburg',
    };

    locationsService.update.mockResolvedValue(location);

    await expect(
      controller.update('6627d9a2c6f2d8f3e2b1a001', dto, actor),
    ).resolves.toBe(location);
    expect(locationsService.update).toHaveBeenCalledWith(
      '6627d9a2c6f2d8f3e2b1a001',
      dto,
      actor,
    );
  });

  it('removes a location', async () => {
    locationsService.remove.mockResolvedValue(location);

    await expect(
      controller.remove('6627d9a2c6f2d8f3e2b1a001', actor),
    ).resolves.toBe(location);
  });
});
