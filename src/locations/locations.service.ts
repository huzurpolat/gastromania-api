import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { Location, LocationDocument } from './schemas/location.schema';

@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
  ) {}

  async create(
    createLocationDto: CreateLocationDto,
  ): Promise<LocationDocument> {
    return this.locationModel.create(createLocationDto);
  }

  async findAll(): Promise<LocationDocument[]> {
    return this.locationModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<LocationDocument> {
    this.validateObjectId(id);

    const location = await this.locationModel.findById(id).exec();

    if (!location) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return location;
  }

  async update(
    id: string,
    updateLocationDto: UpdateLocationDto,
  ): Promise<LocationDocument> {
    this.validateObjectId(id);

    const updatedLocation = await this.locationModel
      .findByIdAndUpdate(id, updateLocationDto, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updatedLocation) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return updatedLocation;
  }

  async remove(id: string): Promise<LocationDocument> {
    this.validateObjectId(id);

    const deletedLocation = await this.locationModel
      .findByIdAndDelete(id)
      .exec();

    if (!deletedLocation) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return deletedLocation;
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige Standort-ID');
    }
  }
}
