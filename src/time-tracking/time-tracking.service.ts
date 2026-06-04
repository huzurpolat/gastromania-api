import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import {
  Location,
  LocationDocument,
} from '../locations/schemas/location.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { CreateTimeCorrectionDto } from './dto/time-correction.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import {
  TimeCorrection,
  TimeCorrectionDocument,
  TimeCorrectionStatus,
} from './schemas/time-correction.schema';
import { TimeEntry, TimeEntryDocument } from './schemas/time-entry.schema';

@Injectable()
export class TimeTrackingService {
  constructor(
    @InjectModel(TimeEntry.name)
    private readonly timeEntryModel: Model<TimeEntryDocument>,
    @InjectModel(TimeCorrection.name)
    private readonly correctionModel: Model<TimeCorrectionDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async clockIn(
    createTimeEntryDto: CreateTimeEntryDto,
    actor: AuthenticatedUser,
  ): Promise<TimeEntryDocument> {
    const employeeId = this.accessPolicy.isManagementRole(actor)
      ? (createTimeEntryDto.employeeId ?? actor.sub)
      : actor.sub;

    await this.assertCanAccessEmployee(actor, employeeId);
    await this.assertCanUseLocation(
      actor,
      createTimeEntryDto.locationId,
      employeeId,
    );

    const openEntry = await this.timeEntryModel
      .findOne({ employeeId, clockOut: { $exists: false } })
      .exec();

    if (openEntry) {
      throw new BadRequestException(
        'Es gibt bereits eine offene Zeiterfassung',
      );
    }

    return this.timeEntryModel.create({
      locationId: createTimeEntryDto.locationId,
      employeeId,
      clockIn: new Date(),
      breakMinutes: createTimeEntryDto.breakMinutes ?? 0,
      note: createTimeEntryDto.note,
    });
  }

  async clockOut(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<TimeEntryDocument> {
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

    if (this.accessPolicy.isManagementRole(actor)) {
      Object.assign(
        query,
        await this.accessPolicy.getScopedResourceFilter(
          actor,
          filters.locationId,
        ),
      );
      if (filters.employeeId) {
        await this.assertCanAccessEmployee(actor, filters.employeeId);
        query.employeeId = filters.employeeId;
      }
    } else {
      query.employeeId = actor.sub;
      if (filters.locationId) {
        await this.accessPolicy.assertCanAccessLocation(
          actor,
          filters.locationId,
        );
        query.locationId = filters.locationId;
      }
    }

    return this.timeEntryModel.find(query).sort({ clockIn: -1 }).exec();
  }

  async findCorrections(
    actor: AuthenticatedUser,
    filters: { employeeId?: string; status?: TimeCorrectionStatus } = {},
  ): Promise<TimeCorrectionDocument[]> {
    const query: Record<string, unknown> = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (this.accessPolicy.isManagementRole(actor)) {
      if (filters.employeeId) {
        await this.assertCanAccessEmployee(actor, filters.employeeId);
        query.employeeId = filters.employeeId;
      } else {
        const scopedEntries = await this.findAll(actor, {});
        query.timeEntryId = {
          $in: scopedEntries.map((entry) => entry._id.toString()),
        };
      }
    } else {
      query.employeeId = actor.sub;
    }

    return this.correctionModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async requestCorrection(
    payload: CreateTimeCorrectionDto,
    actor: AuthenticatedUser,
  ): Promise<TimeCorrectionDocument> {
    this.validateObjectId(payload.timeEntryId);
    const entry = await this.timeEntryModel
      .findById(payload.timeEntryId)
      .exec();
    if (!entry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }
    await this.assertCanAccessEmployee(actor, entry.employeeId);
    this.assertCorrectionRange(payload, entry);

    return this.correctionModel.create({
      timeEntryId: entry._id.toString(),
      employeeId: entry.employeeId,
      locationId: entry.locationId,
      requestedClockIn: payload.requestedClockIn
        ? new Date(payload.requestedClockIn)
        : entry.clockIn,
      requestedClockOut: payload.requestedClockOut
        ? new Date(payload.requestedClockOut)
        : entry.clockOut,
      requestedBreakMinutes:
        payload.requestedBreakMinutes ?? entry.breakMinutes,
      reason: payload.reason,
      status: TimeCorrectionStatus.Requested,
    });
  }

  async approveCorrection(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<TimeCorrectionDocument> {
    const correction = await this.getCorrectionOrThrow(id);
    this.assertCanManageTimeCorrections(actor);
    await this.assertCanAccessEmployee(actor, correction.employeeId);
    const entry = await this.timeEntryModel
      .findById(correction.timeEntryId)
      .exec();
    if (!entry) {
      throw new NotFoundException('Zeiteintrag nicht gefunden');
    }
    entry.clockIn = correction.requestedClockIn ?? entry.clockIn;
    entry.clockOut = correction.requestedClockOut ?? entry.clockOut;
    entry.breakMinutes = correction.requestedBreakMinutes;
    await entry.save();
    correction.status = TimeCorrectionStatus.Approved;
    correction.decidedBy = actor.sub;
    correction.decidedAt = new Date();
    return correction.save();
  }

  async rejectCorrection(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<TimeCorrectionDocument> {
    const correction = await this.getCorrectionOrThrow(id);
    this.assertCanManageTimeCorrections(actor);
    await this.assertCanAccessEmployee(actor, correction.employeeId);
    correction.status = TimeCorrectionStatus.Rejected;
    correction.decidedBy = actor.sub;
    correction.decidedAt = new Date();
    return correction.save();
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

    const employeeId =
      updateTimeEntryDto.employeeId ?? existingEntry.employeeId;
    const locationId =
      updateTimeEntryDto.locationId ?? existingEntry.locationId;

    await this.assertCanAccessEmployee(actor, employeeId);
    await this.assertCanUseLocation(actor, locationId, employeeId);

    const clockIn = updateTimeEntryDto.clockIn
      ? new Date(updateTimeEntryDto.clockIn)
      : existingEntry.clockIn;
    const clockOut = updateTimeEntryDto.clockOut
      ? new Date(updateTimeEntryDto.clockOut)
      : existingEntry.clockOut;

    if (clockOut && clockIn.getTime() >= clockOut.getTime()) {
      throw new BadRequestException(
        'Arbeitsende muss nach Arbeitsbeginn liegen',
      );
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
    if (this.accessPolicy.isPlatformAdmin(actor) || actor.sub === employeeId) {
      return;
    }

    const employee = await this.userModel.findById(employeeId).exec();

    if (!employee) {
      throw new NotFoundException('Mitarbeiter nicht gefunden');
    }

    if (!(await this.accessPolicy.canManageUser(actor, employee))) {
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

    const employeeLocationIds = this.getUserLocationIds(employee);

    if (
      employeeLocationIds.length &&
      !employeeLocationIds.includes(locationId)
    ) {
      throw new BadRequestException(
        'Mitarbeiter ist dieser Filiale nicht zugewiesen',
      );
    }

    await this.accessPolicy.assertCanAccessLocation(actor, locationId);
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

  private async getCorrectionOrThrow(
    id: string,
  ): Promise<TimeCorrectionDocument> {
    this.validateObjectId(id);
    const correction = await this.correctionModel.findById(id).exec();
    if (!correction) {
      throw new NotFoundException('Korrekturantrag nicht gefunden');
    }
    return correction;
  }

  private assertCanManageTimeCorrections(actor: AuthenticatedUser): void {
    if (!this.accessPolicy.isManagementRole(actor)) {
      throw new ForbiddenException(
        'Keine Berechtigung fuer Zeiterfassungs-Korrekturen',
      );
    }
  }

  private assertCorrectionRange(
    payload: CreateTimeCorrectionDto,
    entry: TimeEntryDocument,
  ): void {
    const clockIn = payload.requestedClockIn
      ? new Date(payload.requestedClockIn)
      : entry.clockIn;
    const clockOut = payload.requestedClockOut
      ? new Date(payload.requestedClockOut)
      : entry.clockOut;

    if (clockOut && clockIn.getTime() >= clockOut.getTime()) {
      throw new BadRequestException(
        'Korrigiertes Arbeitsende muss nach Arbeitsbeginn liegen',
      );
    }
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Ungueltige ID');
    }
  }
}
