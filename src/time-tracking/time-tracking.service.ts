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
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { TimeEntry, TimeEntryDocument } from './schemas/time-entry.schema';

@Injectable()
export class TimeTrackingService {
  constructor(
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async clockIn(
    createTimeEntryDto: CreateTimeEntryDto,
    actor: AuthenticatedUser,
  ): Promise<TimeEntryDocument> {
    const employeeId =
      actor.roles.includes(Role.Admin) || actor.roles.includes(Role.Filialleiter)
        ? createTimeEntryDto.employeeId ?? actor.sub
        : actor.sub;

    await this.assertCanAccessEmployee(actor, employeeId);
    await this.assertCanUseLocation(actor, createTimeEntryDto.locationId, employeeId);

    const openEntry = await this.timeEntryModel
      .findOne({ employeeId, clockOut: { $exists: false } })
      .exec();

    if (openEntry) {
      throw new BadRequestException('Es gibt bereits eine offene Zeiterfassung');
    }

    return this.timeEntryModel.create({
      locationId: createTimeEntryDto.locationId,
      employeeId,
      clockIn: new Date(),
      breakMinutes: createTimeEntryDto.breakMinutes ?? 0,
      note: createTimeEntryDto.note,
    });
  }

  async clockOut(id: string, actor: AuthenticatedUser): Promise<TimeEntryDocument> {
    this.validateObjectId(id);
    const entry = await this.timeEntryModel.findById(id).exec();

    if (!entry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }

    await this.assertCanAccessEmployee(actor, entry.employeeId);

    if (entry.clockOut) {
      throw new BadRequestException('Zeiteintrag ist bereits abgeschlossen');
    }

    entry.clockOut = new Date();
    return entry.save();
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: {
      locationId?: string;
      employeeId?: string;
      start?: string;
      end?: string;
      open?: string;
    },
  ): Promise<TimeEntryDocument[]> {
    const query: Record<string, unknown> = {};

    if (filters.start || filters.end) {
      query.clockIn = {
        ...(filters.start ? { $gte: new Date(filters.start) } : {}),
        ...(filters.end ? { $lte: new Date(filters.end) } : {}),
      };
    }

    if (filters.open === 'true') {
      query.clockOut = { $exists: false };
    }

    if (filters.locationId) {
      query.locationId = filters.locationId;
    }

    if (actor.roles.includes(Role.Admin)) {
      if (filters.employeeId) {
        query.employeeId = filters.employeeId;
      }
    } else if (actor.roles.includes(Role.Filialleiter)) {
      const managerLocationIds = await this.getManagerLocationIds(actor.sub);

      if (filters.locationId && !managerLocationIds.includes(filters.locationId)) {
        throw new ForbiddenException('Nicht ausreichende Berechtigung');
      }

      query.locationId = filters.locationId ?? { $in: managerLocationIds };

      if (filters.employeeId) {
        await this.assertCanAccessEmployee(actor, filters.employeeId);
        query.employeeId = filters.employeeId;
      }
    } else {
      query.employeeId = actor.sub;
    }

    return this.timeEntryModel.find(query).sort({ clockIn: -1 }).exec();
  }

  async update(
    id: string,
    updateTimeEntryDto: UpdateTimeEntryDto,
    actor: AuthenticatedUser,
  ): Promise<TimeEntryDocument> {
    this.validateObjectId(id);
    const existingEntry = await this.timeEntryModel.findById(id).exec();

    if (!existingEntry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }

    await this.assertCanAccessEmployee(actor, existingEntry.employeeId);

    const employeeId = updateTimeEntryDto.employeeId ?? existingEntry.employeeId;
    const locationId = updateTimeEntryDto.locationId ?? existingEntry.locationId;

    await this.assertCanAccessEmployee(actor, employeeId);
    await this.assertCanUseLocation(actor, locationId, employeeId);

    const clockIn = updateTimeEntryDto.clockIn
      ? new Date(updateTimeEntryDto.clockIn)
      : existingEntry.clockIn;
    const clockOut = updateTimeEntryDto.clockOut
      ? new Date(updateTimeEntryDto.clockOut)
      : existingEntry.clockOut;

    if (clockOut && clockIn.getTime() >= clockOut.getTime()) {
      throw new BadRequestException('Arbeitsende muss nach Arbeitsbeginn liegen');
    }

    const updatedEntry = await this.timeEntryModel
      .findByIdAndUpdate(
        id,
        {
          ...updateTimeEntryDto,
          employeeId,
          locationId,
          ...(updateTimeEntryDto.clockIn ? { clockIn } : {}),
          ...(updateTimeEntryDto.clockOut ? { clockOut } : {}),
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updatedEntry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }

    return updatedEntry;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    this.validateObjectId(id);
    const entry = await this.timeEntryModel.findById(id).exec();

    if (!entry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }

    await this.assertCanAccessEmployee(actor, entry.employeeId);
    await this.timeEntryModel.findByIdAndDelete(id).exec();
  }

  private async assertCanAccessEmployee(
    actor: AuthenticatedUser,
    employeeId: string,
  ): Promise<void> {
    if (actor.roles.includes(Role.Admin) || actor.sub === employeeId) {
      return;
    }

    if (!actor.roles.includes(Role.Filialleiter)) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }

    const managerLocationIds = await this.getManagerLocationIds(actor.sub);
    const employee = await this.userModel.findById(employeeId).exec();

    if (!employee) {
      throw new NotFoundException('Mitarbeiter nicht gefunden');
    }

    const employeeLocationIds = this.getUserLocationIds(employee);

    if (!employeeLocationIds.some((id) => managerLocationIds.includes(id))) {
      throw new ForbiddenException('Nicht ausreichende Berechtigung');
    }
  }

  private async assertCanUseLocation(
    actor: AuthenticatedUser,
    locationId: string,
    employeeId: string,
  ): Promise<void> {
    const employee = await this.userModel.findById(employeeId).exec();

    if (!employee) {
      throw new NotFoundException('Mitarbeiter nicht gefunden');
    }

    if (actor.roles.includes(Role.Admin)) {
      return;
    }

    const employeeLocationIds = this.getUserLocationIds(employee);

    if (employeeLocationIds.length && !employeeLocationIds.includes(locationId)) {
      throw new BadRequestException(
        'Mitarbeiter ist dieser Filiale nicht zugewiesen',
      );
    }

    if (actor.roles.includes(Role.Filialleiter)) {
      const managerLocationIds = await this.getManagerLocationIds(actor.sub);

      if (!managerLocationIds.includes(locationId)) {
        throw new ForbiddenException('Nicht ausreichende Berechtigung');
      }
    }
  }

  private async getManagerLocationIds(managerId: string): Promise<string[]> {
    const locations = await this.locationModel
      .find({ managerId })
      .select('_id')
      .exec();

    return locations.map((location) => location._id.toString());
  }

  private getUserLocationIds(user: UserDocument): string[] {
    return [
      ...new Set([
        ...(user.locationIds ?? []),
        ...(user.locationId ? [user.locationId] : []),
      ]),
    ];
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige ID');
    }
  }
}
