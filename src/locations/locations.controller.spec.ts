import { Test, TestingModule } from '@nestjs/testing';
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
    isActive: true,
  } as unknown as LocationDocument;

  const locationsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LocationsController],
      providers: [
        {
          provide: LocationsService,
          useValue: locationsService,
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
    };

    locationsService.create.mockResolvedValue(location);

    await expect(controller.create(dto)).resolves.toBe(location);
    expect(locationsService.create).toHaveBeenCalledWith(dto);
  });

  it('returns all locations', async () => {
    locationsService.findAll.mockResolvedValue([location]);

    await expect(controller.findAll()).resolves.toEqual([location]);
  });

  it('returns one location', async () => {
    locationsService.findOne.mockResolvedValue(location);

    await expect(controller.findOne('6627d9a2c6f2d8f3e2b1a001')).resolves.toBe(
      location,
    );
  });

  it('updates a location', async () => {
    const dto: UpdateLocationDto = { city: 'Hamburg' };

    locationsService.update.mockResolvedValue(location);

    await expect(
      controller.update('6627d9a2c6f2d8f3e2b1a001', dto),
    ).resolves.toBe(location);
    expect(locationsService.update).toHaveBeenCalledWith(
      '6627d9a2c6f2d8f3e2b1a001',
      dto,
    );
  });

  it('removes a location', async () => {
    locationsService.remove.mockResolvedValue(location);

    await expect(controller.remove('6627d9a2c6f2d8f3e2b1a001')).resolves.toBe(
      location,
    );
  });
});
