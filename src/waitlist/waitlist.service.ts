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
import { CreateReservationDto } from '../reservations/dto/create-reservation.dto';
import {
  Reservation,
  ReservationDocument,
  ReservationSource,
  ReservationStatus,
} from '../reservations/schemas/reservation.schema';
import { ReservationsService } from '../reservations/reservations.service';
import {
  RestaurantTable,
  RestaurantTableDocument,
  TableStatus,
} from '../tables/schemas/table.schema';
import { ConvertWaitlistEntryDto } from './dto/convert-waitlist-entry.dto';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';
import { UpdateWaitlistEntryDto } from './dto/update-waitlist-entry.dto';
import {
  WaitlistEntry,
  WaitlistEntryDocument,
  WaitlistSource,
  WaitlistStatus,
} from './schemas/waitlist-entry.schema';

export interface WaitlistFilters {
  locationId?: string;
  status?: WaitlistStatus;
}

export interface WaitlistSuggestion {
  tableId: string;
  tableName: string;
  seats: number;
}

@Injectable()
export class WaitlistService {
  constructor(
    @InjectModel(WaitlistEntry.name)
    private readonly waitlistModel: Model<WaitlistEntryDocument>,
    @InjectModel(RestaurantTable.name)
    private readonly tableModel: Model<RestaurantTableDocument>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    private readonly reservationsService: ReservationsService,
    private readonly guestsService: GuestsService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    payload: CreateWaitlistEntryDto,
    actor: AuthenticatedUser,
  ): Promise<WaitlistEntryDocument> {
    this.validateObjectId(payload.locationId, 'Standort-ID');
    await this.accessPolicy.assertCanAccessLocation(actor, payload.locationId);

    if (payload.preferredTableId) {
      await this.assertTableMatches(
        actor,
        payload.preferredTableId,
        payload.locationId,
        payload.guestCount,
      );
    }

    const estimate = await this.estimateWaitMinutes(
      actor,
      payload.locationId,
      payload.guestCount,
    );
    const guestProfile = await this.guestsService.findOrCreateFromContact(
      {
        tenantId: actor.tenantId,
        locationId: payload.locationId,
        name: payload.guestName,
        phone: payload.phone,
        email: payload.email,
        note: payload.note,
        preferredTableId: payload.preferredTableId,
      },
      actor,
    );

    return this.waitlistModel.create({
      ...payload,
      tenantId: actor.tenantId,
      estimatedWaitMinutes: estimate,
      source: payload.source ?? WaitlistSource.WalkIn,
      status: WaitlistStatus.Waiting,
      createdByUserId: actor.sub,
      guestProfileId: guestProfile ? this.stringifyId(guestProfile._id) : undefined,
    });
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: WaitlistFilters = {},
  ): Promise<Array<WaitlistEntryDocument & { tableSuggestions?: WaitlistSuggestion[] }>> {
    const query = await this.accessPolicy.getScopedResourceFilter(
      actor,
      filters.locationId,
    );

    if (actor.tenantId) {
      query.tenantId = actor.tenantId;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    const entries = await this.waitlistModel
      .find(query)
      .sort({ createdAt: 1 })
      .exec();

    const enriched = [];
    for (const entry of entries) {
      const object = entry.toObject() as WaitlistEntryDocument & {
        tableSuggestions?: WaitlistSuggestion[];
      };
      object.tableSuggestions = await this.suggestTables(
        actor,
        entry.locationId,
        entry.guestCount,
      );
      enriched.push(object);
    }

    return enriched;
  }

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<WaitlistEntryDocument> {
    this.validateObjectId(id, 'Wartelisten-ID');
    const entry = await this.waitlistModel.findById(id).exec();

    if (
      !entry ||
      (actor.tenantId && entry.tenantId !== actor.tenantId) ||
      !(await this.accessPolicy.canAccessLocation(actor, entry.locationId))
    ) {
      throw new NotFoundException('Wartelisteneintrag nicht gefunden');
    }

    return entry;
  }

  async update(
    id: string,
    payload: UpdateWaitlistEntryDto,
    actor: AuthenticatedUser,
  ): Promise<WaitlistEntryDocument> {
    const current = await this.findOne(id, actor);
    const locationId = payload.locationId ?? current.locationId;
    const guestCount = payload.guestCount ?? current.guestCount;
    this.validateObjectId(locationId, 'Standort-ID');
    await this.accessPolicy.assertCanAccessLocation(actor, locationId);

    if (payload.preferredTableId) {
      await this.assertTableMatches(
        actor,
        payload.preferredTableId,
        locationId,
        guestCount,
      );
    }

    const estimatedWaitMinutes = await this.estimateWaitMinutes(
      actor,
      locationId,
      guestCount,
    );
    const guestProfile = await this.guestsService.findOrCreateFromContact(
      {
        tenantId: actor.tenantId,
        locationId,
        name: payload.guestName ?? current.guestName,
        phone: payload.phone ?? current.phone,
        email: payload.email ?? current.email,
        note: payload.note ?? current.note,
        preferredTableId: payload.preferredTableId ?? current.preferredTableId,
      },
      actor,
    );

    const updated = await this.waitlistModel
      .findByIdAndUpdate(
        id,
        {
          ...payload,
          locationId,
          guestCount,
          estimatedWaitMinutes,
          guestProfileId:
            guestProfile ? this.stringifyId(guestProfile._id) : current.guestProfileId,
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Wartelisteneintrag nicht gefunden');
    }

    return updated;
  }

  async notify(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<WaitlistEntryDocument> {
    return this.setStatus(id, WaitlistStatus.Notified, actor);
  }

  async markNoShow(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<WaitlistEntryDocument> {
    return this.setStatus(id, WaitlistStatus.NoShow, actor);
  }

  async cancel(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<WaitlistEntryDocument> {
    return this.setStatus(id, WaitlistStatus.Cancelled, actor);
  }

  async seat(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<WaitlistEntryDocument> {
    const entry = await this.findOne(id, actor);
    const tableId = entry.assignedTableId ?? entry.preferredTableId;
    const suggestion = tableId
      ? undefined
      : (await this.suggestTables(actor, entry.locationId, entry.guestCount))[0];
    const resolvedTableId = tableId ?? suggestion?.tableId;

    if (!resolvedTableId) {
      throw new BadRequestException('Kein freier passender Tisch verfuegbar');
    }

    const table = await this.assertTableMatches(
      actor,
      resolvedTableId,
      entry.locationId,
      entry.guestCount,
    );
    await this.assertNoCurrentReservation(resolvedTableId, entry.locationId);

    await this.tableModel
      .findByIdAndUpdate(resolvedTableId, {
        status: TableStatus.OccupiedState,
        guestCount: entry.guestCount,
        waitingSince: new Date(),
        lastStatusChange: new Date(),
        notes: entry.note,
      })
      .exec();

    const updated = await this.waitlistModel
      .findByIdAndUpdate(
        id,
        {
          status: WaitlistStatus.Seated,
          assignedTableId: this.stringifyId(table._id),
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Wartelisteneintrag nicht gefunden');
    }

    return updated;
  }

  async convertToReservation(
    id: string,
    payload: ConvertWaitlistEntryDto,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    const entry = await this.findOne(id, actor);
    const reservationPayload: CreateReservationDto = {
      locationId: entry.locationId,
      tableId: payload.tableId ?? entry.preferredTableId,
      guestName: entry.guestName,
      guestPhone: entry.phone,
      phone: entry.phone,
      guestEmail: entry.email,
      email: entry.email,
      partySize: entry.guestCount,
      guestCount: entry.guestCount,
      startTime: payload.startTime,
      endTime: payload.endTime,
      status: ReservationStatus.Reserved,
      source: ReservationSource.WalkIn,
      notes: entry.note,
      note: entry.note,
    };

    const reservation = await this.reservationsService.create(
      reservationPayload,
      actor,
    );

    await this.waitlistModel
      .findByIdAndUpdate(id, {
        status: WaitlistStatus.Cancelled,
        reservationId: this.stringifyId(reservation._id),
        guestProfileId:
          entry.guestProfileId ?? reservation.guestProfileId,
      })
      .exec();

    return reservation;
  }

  async markAvailableCandidates(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<WaitlistEntryDocument[]> {
    const waitingEntries = await this.findAll(actor, {
      locationId,
      status: WaitlistStatus.Waiting,
    });
    const notified: WaitlistEntryDocument[] = [];

    for (const entry of waitingEntries) {
      const suggestions = await this.suggestTables(
        actor,
        entry.locationId,
        entry.guestCount,
      );
      if (suggestions.length) {
        const updated = await this.waitlistModel
          .findByIdAndUpdate(
            entry._id,
            { status: WaitlistStatus.Notified },
            { returnDocument: 'after', runValidators: true },
          )
          .exec();
        if (updated) notified.push(updated);
      }
    }

    return notified;
  }

  private async setStatus(
    id: string,
    status: WaitlistStatus,
    actor: AuthenticatedUser,
  ): Promise<WaitlistEntryDocument> {
    const entry = await this.findOne(id, actor);
    await this.accessPolicy.assertCanAccessLocation(actor, entry.locationId);

    const updated = await this.waitlistModel
      .findByIdAndUpdate(
        id,
        { status },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Wartelisteneintrag nicht gefunden');
    }

    return updated;
  }

  private async suggestTables(
    actor: AuthenticatedUser,
    locationId: string,
    guestCount: number,
  ): Promise<WaitlistSuggestion[]> {
    const tables = await this.tableModel
      .find({
        tenantId: actor.tenantId,
        locationId,
        isActive: true,
        seats: { $gte: guestCount },
        status: { $in: [TableStatus.Free, TableStatus.Available] },
      })
      .sort({ seats: 1, name: 1 })
      .lean();

    const suggestions: WaitlistSuggestion[] = [];
    for (const table of tables) {
      const tableId = this.stringifyId(table._id);
      const hasReservation = await this.hasCurrentReservation(tableId, locationId);
      if (!hasReservation) {
        suggestions.push({
          tableId,
          tableName: table.name,
          seats: table.seats,
        });
      }
    }

    return suggestions;
  }

  private async estimateWaitMinutes(
    actor: AuthenticatedUser,
    locationId: string,
    guestCount: number,
  ): Promise<number> {
    const suggestions = await this.suggestTables(actor, locationId, guestCount);
    if (suggestions.length) {
      return 0;
    }

    const waitingAhead = await this.waitlistModel.countDocuments({
      tenantId: actor.tenantId,
      locationId,
      status: { $in: [WaitlistStatus.Waiting, WaitlistStatus.Notified] },
      guestCount: { $lte: guestCount },
    });
    const nextReservationEnd = await this.reservationModel
      .findOne({
        tenantId: actor.tenantId,
        locationId,
        status: { $nin: this.inactiveReservationStatuses() },
        endTime: { $gte: new Date() },
      })
      .sort({ endTime: 1 })
      .select('endTime')
      .lean();
    const reservationMinutes = nextReservationEnd?.endTime
      ? Math.max(
          10,
          Math.ceil(
            (new Date(nextReservationEnd.endTime).getTime() - Date.now()) /
              60_000,
          ),
        )
      : 30;

    return Math.min(180, reservationMinutes + waitingAhead * 10);
  }

  private async assertTableMatches(
    actor: AuthenticatedUser,
    tableId: string,
    locationId: string,
    guestCount: number,
  ): Promise<RestaurantTableDocument> {
    this.validateObjectId(tableId, 'Tisch-ID');
    const table = await this.tableModel.findById(tableId).exec();

    if (
      !table ||
      table.locationId !== locationId ||
      (actor.tenantId && table.tenantId !== actor.tenantId) ||
      !(await this.accessPolicy.canAccessLocation(actor, table.locationId))
    ) {
      throw new NotFoundException('Tisch nicht gefunden');
    }

    if (table.seats < guestCount) {
      throw new BadRequestException(
        `Tisch ${table.name} hat nur ${table.seats} Plaetze fuer ${guestCount} Gaeste`,
      );
    }

    return table;
  }

  private async assertNoCurrentReservation(
    tableId: string,
    locationId: string,
  ): Promise<void> {
    if (await this.hasCurrentReservation(tableId, locationId)) {
      throw new BadRequestException(
        'Dieser Tisch hat im aktuellen Zeitraum eine aktive Reservierung',
      );
    }
  }

  private async hasCurrentReservation(
    tableId: string,
    locationId: string,
  ): Promise<boolean> {
    const now = new Date();
    const reservation = await this.reservationModel.exists({
      tableId,
      locationId,
      status: { $nin: this.inactiveReservationStatuses() },
      startTime: { $lte: now },
      endTime: { $gt: now },
    });

    return Boolean(reservation);
  }

  private inactiveReservationStatuses(): Array<ReservationStatus | string> {
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

  private stringifyId(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Types.ObjectId) return value.toHexString();
    return String(value);
  }
}
