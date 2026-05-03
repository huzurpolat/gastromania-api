import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateDutyShiftDto } from './dto/create-duty-shift.dto';
import { UpdateDutyShiftDto } from './dto/update-duty-shift.dto';
import { DutyShift, DutyShiftDocument } from './schemas/duty-shift.schema';

@Injectable()
export class DutySchedulesService {
  constructor(
    @InjectModel(DutyShift.name)
    private readonly dutyShiftModel: Model<DutyShiftDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(
    createDutyShiftDto: CreateDutyShiftDto,
    actor: AuthenticatedUser,
  ): Promise<DutyShiftDocument> {
    await this.assertCanManageShift(actor, createDutyShiftDto.locationId);
    await this.assertEmployeeCanWorkAtLocation(
      createDutyShiftDto.employeeId,
      createDutyShiftDto.locationId,
    );
    this.assertValidTimeRange(createDutyShiftDto.startTime, createDutyShiftDto.endTime);

    return this.dutyShiftModel.create({
      ...createDutyShiftDto,
      startTime: new Date(createDutyShiftDto.startTime),
      endTime: new Date(createDutyShiftDto.endTime),
    });
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: { locationId?: string; start?: string; end?: string },
  ): Promise<DutyShiftDocument[]> {
    const query: Record<string, unknown> = {};

    if (filters.start || filters.end) {
      query.startTime = {
        ...(filters.start ? { $gte: new Date(filters.start) } : {}),
        ...(filters.end ? { $lte: new Date(filters.end) } : {}),
      };
    }

    if (actor.roles.includes(Role.Admin)) {
      if (filters.locationId) {
        query.locationId = filters.locationId;
      }
    } else if (actor.roles.includes(Role.Filialleiter)) {
      const managerLocationIds = await this.getManagerLocationIds(actor.sub);
      const locationIds = filters.locationId
        ? managerLocationIds.filter((id) => id === filters.locationId)
        : managerLocationIds;

      query.locationId = { $in: locationIds };
    } else {
      query.employeeId = actor.sub;

      if (filters.locationId) {
        query.locationId = filters.locationId;
      }
    }

    return this.dutyShiftModel.find(query).sort({ startTime: 1 }).exec();
  }

  async update(
    id: string,
    updateDutyShiftDto: UpdateDutyShiftDto,
    actor: AuthenticatedUser,
  ): Promise<DutyShiftDocument> {
    this.validateObjectId(id);

    const existingShift = await this.dutyShiftModel.findById(id).exec();

    if (!existingShift) {
      throw new NotFoundException('Schicht nicht gefunden');
    }

    await this.assertCanManageShift(actor, existingShift.locationId);

    const locationId = updateDutyShiftDto.locationId ?? existingShift.locationId;
    const employeeId = updateDutyShiftDto.employeeId ?? existingShift.employeeId;

    await this.assertCanManageShift(actor, locationId);
    await this.assertEmployeeCanWorkAtLocation(employeeId, locationId);

    const startTime = updateDutyShiftDto.startTime ?? existingShift.startTime.toISOString();
    const endTime = updateDutyShiftDto.endTime ?? existingShift.endTime.toISOString();
    this.assertValidTimeRange(startTime, endTime);

    const updatedShift = await this.dutyShiftModel
      .findByIdAndUpdate(
        id,
        {
          ...updateDutyShiftDto,
          ...(updateDutyShiftDto.startTime
            ? { startTime: new Date(updateDutyShiftDto.startTime) }
            : {}),
          ...(updateDutyShiftDto.endTime
            ? { endTime: new Date(updateDutyShiftDto.endTime) }
            : {}),
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updatedShift) {
      throw new NotFoundException('Schicht nicht gefunden');
    }

    return updatedShift;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    this.validateObjectId(id);

    const shift = await this.dutyShiftModel.findById(id).exec();

    if (!shift) {
      throw new NotFoundException('Schicht nicht gefunden');
    }

    await this.assertCanManageShift(actor, shift.locationId);
    await this.dutyShiftModel.findByIdAndDelete(id).exec();
  }

  private async assertCanManageShift(
    actor: AuthenticatedUser,
    locationId: string,
  ): Promise<void> {
    if (actor.roles.includes(Role.Admin)) {
      return;
    }

    if (!actor.roles.includes(Role.Filialleiter)) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }

    const managerLocationIds = await this.getManagerLocationIds(actor.sub);

    if (!managerLocationIds.includes(locationId)) {
      throw new ForbiddenException(
        'Filialleiter duerfen nur Dienstplaene eigener Filialen verwalten',
      );
    }
  }

  private async assertEmployeeCanWorkAtLocation(
    employeeId: string,
    locationId: string,
  ): Promise<void> {
    this.validateObjectId(employeeId);
    const employee = await this.userModel.findById(employeeId).exec();

    if (!employee) {
      throw new NotFoundException('Mitarbeiter nicht gefunden');
    }

    const employeeLocationIds = [
      ...(employee.locationIds ?? []),
      ...(employee.locationId ? [employee.locationId] : []),
    ];

    if (
      !employee.roles.includes(Role.Admin) &&
      employeeLocationIds.length &&
      !employeeLocationIds.includes(locationId)
    ) {
      throw new BadRequestException(
        'Mitarbeiter ist dieser Filiale nicht zugewiesen',
      );
    }
  }

  private assertValidTimeRange(startTime: string, endTime: string): void {
    if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
      throw new BadRequestException('Schichtende muss nach Schichtbeginn liegen');
    }
  }

  private async getManagerLocationIds(managerId: string): Promise<string[]> {
    const locations = await this.locationModel
      .find({ managerId })
      .select('_id')
      .exec();

    return locations.map((location) => location._id.toString());
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige ID');
    }
  }
}
