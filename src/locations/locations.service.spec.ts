import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';
import { Location, LocationDocument } from './schemas/location.schema';

describe('LocationsService', () => {
  let service: LocationsService;

  const location = {
    _id: '6627d9a2c6f2d8f3e2b1a001',
    name: 'Gastromania Mitte',
    street: 'Hauptstrasse 1',
    zip: '10115',
    city: 'Berlin',
    isActive: true,
  } as unknown as LocationDocument;

  const locationModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        {
          provide: getModelToken(Location.name),
          useValue: locationModel,
        },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    jest.clearAllMocks();
  });

  it('creates a location', async () => {
    const dto: CreateLocationDto = {
      name: 'Gastromania Mitte',
      street: 'Hauptstrasse 1',
      zip: '10115',
      city: 'Berlin',
    };

    locationModel.create.mockResolvedValue(location);

    await expect(service.create(dto)).resolves.toBe(location);
    expect(locationModel.create).toHaveBeenCalledWith(dto);
  });

  it('returns all locations sorted by newest first', async () => {
    const exec = jest.fn().mockResolvedValue([location]);
    const sort = jest.fn().mockReturnValue({ exec });

    locationModel.find.mockReturnValue({ sort });

    await expect(service.findAll()).resolves.toEqual([location]);
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
  });

  it('returns one location by id', async () => {
    locationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });

    await expect(service.findOne('6627d9a2c6f2d8f3e2b1a001')).resolves.toBe(
      location,
    );
  });

  it('throws BadRequestException for an invalid id', async () => {
    await expect(service.findOne('invalid-id')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException when a location does not exist', async () => {
    locationModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.findOne('6627d9a2c6f2d8f3e2b1a001'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates a location', async () => {
    const dto: UpdateLocationDto = { city: 'Hamburg' };

    locationModel.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });

    await expect(service.update('6627d9a2c6f2d8f3e2b1a001', dto)).resolves.toBe(
      location,
    );
    expect(locationModel.findByIdAndUpdate).toHaveBeenCalledWith(
      '6627d9a2c6f2d8f3e2b1a001',
      dto,
      {
        new: true,
        runValidators: true,
      },
    );
  });

  it('removes a location', async () => {
    locationModel.findByIdAndDelete.mockReturnValue({
      exec: jest.fn().mockResolvedValue(location),
    });

    await expect(service.remove('6627d9a2c6f2d8f3e2b1a001')).resolves.toBe(
      location,
    );
  });
});
