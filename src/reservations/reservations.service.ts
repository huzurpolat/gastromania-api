import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { GuestsService } from '../guests/guests.service';
import {
  RestaurantTable,
  RestaurantTableDocument,
} from '../tables/schemas/table.schema';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import {
  Reservation,
  ReservationDocument,
  ReservationSource,
  ReservationStatus,
} from './schemas/reservation.schema';

export interface ReservationFilters {
  locationId?: string;
  tableId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: ReservationStatus;
}

interface ReservationWindow {
  startTime: Date;
  endTime: Date;
}

@Injectable()
export class ReservationsService {
  constructor(
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    private readonly accessPolicy: AccessPolicyService,
    private readonly guestsService: GuestsService,
  ) {}

  async create(
    createReservationDto: CreateReservationDto,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    this.validateObjectId(createReservationDto.locationId, 'Standort-ID');
    await this.accessPolicy.assertCanAccessLocation(
      actor,
      createReservationDto.locationId,
    );

    const window = this.validateTimeRange(
      createReservationDto.startTime,
      createReservationDto.endTime,
    );
    const partySize = createReservationDto.guestCount ?? createReservationDto.partySize;
    const tableId =
      createReservationDto.tableId ??
      (await this.suggestTableId(
        actor,
        createReservationDto.locationId,
        partySize,
        window,
      ));

    if (tableId) {
      await this.assertTableCanBeReserved(
        actor,
        tableId,
        createReservationDto.locationId,
        partySize,
        window,
      );
    }
    const guestProfile = await this.guestsService.findOrCreateFromContact(
      {
        tenantId: actor.tenantId,
        locationId: createReservationDto.locationId,
        name: createReservationDto.guestName,
        phone: createReservationDto.phone ?? createReservationDto.guestPhone,
        email: createReservationDto.email ?? createReservationDto.guestEmail,
        note: createReservationDto.note ?? createReservationDto.notes,
        preferredTableId: tableId,
      },
      actor,
    );

    return this.reservationModel.create({
      ...createReservationDto,
      tenantId: actor.tenantId,
      reservationNumber: this.createReservationNumber(),
      tableId,
      partySize,
      guestCount: partySize,
      guestPhone: createReservationDto.guestPhone ?? createReservationDto.phone,
      phone: createReservationDto.phone ?? createReservationDto.guestPhone,
      guestEmail: createReservationDto.guestEmail ?? createReservationDto.email,
      email: createReservationDto.email ?? createReservationDto.guestEmail,
      notes: createReservationDto.notes ?? createReservationDto.note,
      note: createReservationDto.note ?? createReservationDto.notes,
      reservationDate: this.startOfDay(window.startTime),
      startTime: window.startTime,
      endTime: window.endTime,
      status: createReservationDto.status ?? ReservationStatus.Reserved,
      source: createReservationDto.source ?? ReservationSource.Manual,
      createdByUserId: actor.sub,
      guestProfileId: guestProfile ? this.stringifyId(guestProfile._id) : undefined,
    });
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: ReservationFilters = {},
  ): Promise<ReservationDocument[]> {
    const query = await this.accessPolicy.getScopedResourceFilter(
      actor,
      filters.locationId,
    );

    if (actor.tenantId) {
      query.tenantId = actor.tenantId;
    }

    if (filters.locationId) {
      this.validateObjectId(filters.locationId, 'Standort-ID');
    }

    if (filters.tableId) {
      this.validateObjectId(filters.tableId, 'Tisch-ID');
      query.tableId = filters.tableId;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.dateFrom || filters.dateTo) {
      query.startTime = {
        ...(filters.dateFrom ? { $gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { $lt: new Date(filters.dateTo) } : {}),
      };
    }

    return this.reservationModel.find(query).sort({ startTime: 1 }).exec();
  }

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    this.validateObjectId(id, 'Reservierungs-ID');

    const reservation = await this.reservationModel.findById(id).exec();

    if (
      !reservation ||
      (actor.tenantId && reservation.tenantId !== actor.tenantId) ||
      !(await this.accessPolicy.canAccessLocation(
        actor,
        reservation.locationId,
      ))
    ) {
      throw new NotFoundException('Reservierung nicht gefunden');
    }

    return reservation;
  }

  async update(
    id: string,
    updateReservationDto: UpdateReservationDto,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    this.validateObjectId(id, 'Reservierungs-ID');
    const currentReservation = await this.findOne(id, actor);
    await this.accessPolicy.assertCanAccessLocation(
      actor,
      currentReservation.locationId,
    );

    const locationId = updateReservationDto.locationId ?? currentReservation.locationId;
    this.validateObjectId(locationId, 'Standort-ID');
    await this.accessPolicy.assertCanAccessLocation(actor, locationId);

    const startTime =
      updateReservationDto.startTime ?? currentReservation.startTime.toISOString();
    const endTime =
      updateReservationDto.endTime ?? currentReservation.endTime.toISOString();
    const window = this.validateTimeRange(startTime, endTime);
    const partySize =
      updateReservationDto.guestCount ??
      updateReservationDto.partySize ??
      currentReservation.guestCount ??
      currentReservation.partySize;
    const tableId =
      updateReservationDto.tableId ??
      currentReservation.tableId ??
      (await this.suggestTableId(actor, locationId, partySize, window, id));

    if (tableId) {
      await this.assertTableCanBeReserved(
        actor,
        tableId,
        locationId,
        partySize,
        window,
        id,
      );
    }
    const guestProfile = await this.guestsService.findOrCreateFromContact(
      {
        tenantId: actor.tenantId,
        locationId,
        name: updateReservationDto.guestName ?? currentReservation.guestName,
        phone:
          updateReservationDto.phone ??
          updateReservationDto.guestPhone ??
          currentReservation.phone ??
          currentReservation.guestPhone,
        email:
          updateReservationDto.email ??
          updateReservationDto.guestEmail ??
          currentReservation.email ??
          currentReservation.guestEmail,
        note:
          updateReservationDto.note ??
          updateReservationDto.notes ??
          currentReservation.note ??
          currentReservation.notes,
        preferredTableId: tableId,
      },
      actor,
    );

    const updatedReservation = await this.reservationModel
      .findByIdAndUpdate(
        id,
        {
          ...updateReservationDto,
          locationId,
          tableId,
          partySize,
          guestCount: partySize,
          guestPhone:
            updateReservationDto.guestPhone ??
            updateReservationDto.phone ??
            currentReservation.guestPhone,
          phone:
            updateReservationDto.phone ??
            updateReservationDto.guestPhone ??
            currentReservation.phone,
          guestEmail:
            updateReservationDto.guestEmail ??
            updateReservationDto.email ??
            currentReservation.guestEmail,
          email:
            updateReservationDto.email ??
            updateReservationDto.guestEmail ??
            currentReservation.email,
          notes:
            updateReservationDto.notes ??
            updateReservationDto.note ??
            currentReservation.notes,
          note:
            updateReservationDto.note ??
            updateReservationDto.notes ??
            currentReservation.note,
          reservationDate: this.startOfDay(window.startTime),
          startTime: window.startTime,
          endTime: window.endTime,
          guestProfileId:
            guestProfile ? this.stringifyId(guestProfile._id) : currentReservation.guestProfileId,
        },
        {
          returnDocument: 'after',
          runValidators: true,
        },
      )
      .exec();

    if (!updatedReservation) {
      throw new NotFoundException('Reservierung nicht gefunden');
    }

    return updatedReservation;
  }

  async checkIn(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    return this.setStatus(id, ReservationStatus.CheckedIn, actor);
  }

  async complete(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    return this.setStatus(id, ReservationStatus.Completed, actor);
  }

  async markNoShow(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    return this.setStatus(id, ReservationStatus.NoShow, actor);
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    return this.setStatus(id, ReservationStatus.Cancelled, actor);
  }

  private async setStatus(
    id: string,
    status: ReservationStatus,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    const reservation = await this.findOne(id, actor);
    await this.accessPolicy.assertCanAccessLocation(actor, reservation.locationId);

    const updatedReservation = await this.reservationModel
      .findByIdAndUpdate(
        id,
        { status },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updatedReservation) {
      throw new NotFoundException('Reservierung nicht gefunden');
    }

    return updatedReservation;
  }

  private async suggestTableId(
    actor: AuthenticatedUser,
    locationId: string,
    partySize: number,
    window: ReservationWindow,
    ignoreReservationId?: string,
  ): Promise<string | undefined> {
    const tables = await this.tableModel
      .find({
        tenantId: actor.tenantId,
        locationId,
        isActive: true,
        seats: { $gte: partySize },
      })
      .sort({ seats: 1, name: 1 })
      .lean();

    for (const table of tables) {
      const tableId = this.stringifyId(table._id);
      const conflict = await this.findOverlappingReservation(
        tableId,
        locationId,
        window,
        ignoreReservationId,
      );
      if (!conflict) {
        return tableId;
      }
    }

    return undefined;
  }

  private async assertTableCanBeReserved(
    actor: AuthenticatedUser,
    tableId: string,
    locationId: string,
    partySize: number,
    window: ReservationWindow,
    ignoreReservationId?: string,
  ): Promise<void> {
    this.validateObjectId(tableId, 'Tisch-ID');
    const table = await this.tableModel.findById(tableId).lean();

    if (
      !table ||
      table.locationId !== locationId ||
      (actor.tenantId && table.tenantId !== actor.tenantId) ||
      !(await this.accessPolicy.canAccessLocation(actor, table.locationId))
    ) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    if (table.seats < partySize) {
      throw new BadRequestException(
        `Tisch ${table.name} hat nur ${table.seats} Plaetze fuer ${partySize} Gaeste`,
      );
    }

    const conflict = await this.findOverlappingReservation(
      tableId,
      locationId,
      window,
      ignoreReservationId,
    );

    if (conflict) {
      throw new BadRequestException(
        `Tisch ${table.name} ist im gewaehlten Zeitraum bereits reserviert`,
      );
    }
  }

  private findOverlappingReservation(
    tableId: string,
    locationId: string,
    window: ReservationWindow,
    ignoreReservationId?: string,
  ): Promise<ReservationDocument | null> {
    const query: Record<string, unknown> = {
      tableId,
      locationId,
      status: { $nin: this.inactiveStatuses() },
      startTime: { $lt: window.endTime },
      endTime: { $gt: window.startTime },
    };

    if (ignoreReservationId) {
      query._id = { $ne: ignoreReservationId };
    }

    return this.reservationModel.findOne(query).exec();
  }

  private inactiveStatuses(): Array<ReservationStatus | string> {
    return [
      ReservationStatus.Cancelled,
      ReservationStatus.Completed,
      ReservationStatus.NoShow,
      'Storniert',
      'NoShow',
    ];
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private validateTimeRange(startTime: string, endTime: string): ReservationWindow {
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      throw new BadRequestException('Ungueltiger Reservierungszeitraum');
    }

    if (end <= start) {
      throw new BadRequestException('Endzeit muss nach der Startzeit liegen');
    }

    return { startTime: start, endTime: end };
  }

  private startOfDay(value: Date): Date {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private createReservationNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `RSV-${date}-${suffix}`;
  }

  private stringifyId(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Types.ObjectId) return value.toHexString();
    return String(value);
  }
}
