import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { Location, LocationDocument } from './schemas/location.schema';

@Injectable()
export class LocationsService {
  constructor(
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    createLocationDto: CreateLocationDto,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    const payload = {
      ...createLocationDto,
      companyId: createLocationDto.companyId ?? actor.companyId,
      regionId:
        createLocationDto.regionId ??
        (actor.regionIds?.length === 1 ? actor.regionIds[0] : undefined),
    };

    if (payload.companyId) {
      await this.accessPolicy.assertCompanyExists(payload.companyId);
    }

    if (payload.regionId) {
      await this.accessPolicy.assertRegionExists(payload.regionId);
    }

    await this.accessPolicy.assertAssignableScope(actor, {
      companyId: payload.companyId,
      regionIds: payload.regionId ? [payload.regionId] : [],
      managedLocationIds: [],
      roles: [],
    });

    return this.locationModel.create(payload);
  }

  async findAll(actor: AuthenticatedUser): Promise<LocationDocument[]> {
    const filter = await this.accessPolicy.getReadableLocationFilter(actor);

    return this.locationModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    this.validateObjectId(id);

    const location = await this.locationModel.findById(id).exec();

    if (!location || !(await this.accessPolicy.canAccessLocation(actor, id))) {
      throw new NotFoundException('Standort nicht gefunden');
    }

    return location;
  }

  async update(
    id: string,
    updateLocationDto: UpdateLocationDto,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    this.validateObjectId(id);
    await this.accessPolicy.assertCanManageLocation(actor, id);

    if (updateLocationDto.companyId) {
      await this.accessPolicy.assertCompanyExists(updateLocationDto.companyId);
    }

    if (updateLocationDto.regionId) {
      await this.accessPolicy.assertRegionExists(updateLocationDto.regionId);
      await this.accessPolicy.assertAssignableScope(actor, {
        companyId: updateLocationDto.companyId,
        regionIds: [updateLocationDto.regionId],
      });
    }

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

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<LocationDocument> {
    this.validateObjectId(id);
    await this.accessPolicy.assertCanManageLocation(actor, id);

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
