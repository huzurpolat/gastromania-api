import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AccessPolicyService } from '../access/access-policy.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { Reservation, ReservationDocument } from './schemas/reservation.schema';

export interface ReservationFilters {
  locationId?: string;
  tableId?: string;
}

@Injectable()
export class ReservationsService {
  constructor(
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  async create(
    createReservationDto: CreateReservationDto,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    this.validateObjectId(createReservationDto.locationId, 'Standort-ID');
    this.validateObjectId(createReservationDto.tableId, 'Tisch-ID');
    await this.accessPolicy.assertCanAccessLocation(
      actor,
      createReservationDto.locationId,
    );
    this.validateTimeRange(
      createReservationDto.startTime,
      createReservationDto.endTime,
    );

    return this.reservationModel.create(createReservationDto);
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: ReservationFilters = {},
  ): Promise<ReservationDocument[]> {
    const query = await this.accessPolicy.getScopedResourceFilter(
      actor,
      filters.locationId,
    );

    if (filters.locationId) {
      this.validateObjectId(filters.locationId, 'Standort-ID');
    }

    if (filters.tableId) {
      this.validateObjectId(filters.tableId, 'Tisch-ID');
      query.tableId = filters.tableId;
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

    if (updateReservationDto.locationId) {
      this.validateObjectId(updateReservationDto.locationId, 'Standort-ID');
      await this.accessPolicy.assertCanAccessLocation(
        actor,
        updateReservationDto.locationId,
      );
    }

    if (updateReservationDto.tableId) {
      this.validateObjectId(updateReservationDto.tableId, 'Tisch-ID');
    }

    if (updateReservationDto.startTime || updateReservationDto.endTime) {
      this.validateTimeRange(
        updateReservationDto.startTime ??
          currentReservation.startTime.toISOString(),
        updateReservationDto.endTime ??
          currentReservation.endTime.toISOString(),
      );
    }

    const updatedReservation = await this.reservationModel
      .findByIdAndUpdate(id, updateReservationDto, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updatedReservation) {
      throw new NotFoundException('Reservierung nicht gefunden');
    }

    return updatedReservation;
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ReservationDocument> {
    this.validateObjectId(id, 'Reservierungs-ID');
    const reservation = await this.findOne(id, actor);
    await this.accessPolicy.assertCanManageLocation(
      actor,
      reservation.locationId,
    );

    const deletedReservation = await this.reservationModel
      .findByIdAndDelete(id)
      .exec();

    if (!deletedReservation) {
      throw new NotFoundException('Reservierung nicht gefunden');
    }

    return deletedReservation;
  }

  private validateObjectId(id: string, label: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Ungueltige ${label}`);
    }
  }

  private validateTimeRange(startTime: string, endTime: string): void {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();

    if (end <= start) {
      throw new BadRequestException('Endzeit muss nach der Startzeit liegen');
    }
  }
}
