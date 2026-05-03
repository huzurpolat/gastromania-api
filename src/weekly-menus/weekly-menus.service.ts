import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { CreateWeeklyMenuDto } from './dto/create-weekly-menu.dto';
import { UpdateWeeklyMenuDto } from './dto/update-weekly-menu.dto';
import { WeeklyMenu, WeeklyMenuDocument } from './schemas/weekly-menu.schema';

@Injectable()
export class WeeklyMenusService {
  constructor(
    @InjectModel(WeeklyMenu.name)
    private readonly weeklyMenuModel: Model<WeeklyMenuDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
  ) {}

  async create(
    createWeeklyMenuDto: CreateWeeklyMenuDto,
    actor: AuthenticatedUser,
  ): Promise<WeeklyMenuDocument> {
    await this.assertCanManageLocation(actor, createWeeklyMenuDto.locationId);

    try {
      return await this.weeklyMenuModel.create(this.normalizePayload(createWeeklyMenuDto));
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Für diese Filiale und Woche existiert bereits eine Wochenkarte');
      }

      throw error;
    }
  }

  async findAll(
    actor: AuthenticatedUser,
    filters: { locationId?: string; start?: string; end?: string },
  ): Promise<WeeklyMenuDocument[]> {
    const query: Record<string, unknown> = {};

    if (filters.start || filters.end) {
      query.weekStart = {
        ...(filters.start ? { $gte: new Date(filters.start) } : {}),
        ...(filters.end ? { $lte: new Date(filters.end) } : {}),
      };
    }

    if (actor.roles.includes(Role.Admin)) {
      if (filters.locationId) {
        query.locationId = filters.locationId;
      }
    } else {
      const locationIds = actor.roles.includes(Role.Filialleiter)
        ? await this.getManagerLocationIds(actor.sub)
        : [];

      if (filters.locationId) {
        query.locationId = filters.locationId;
      } else if (locationIds.length) {
        query.locationId = { $in: locationIds };
      }
    }

    return this.weeklyMenuModel.find(query).sort({ weekStart: -1 }).exec();
  }

  async update(
    id: string,
    updateWeeklyMenuDto: UpdateWeeklyMenuDto,
    actor: AuthenticatedUser,
  ): Promise<WeeklyMenuDocument> {
    this.validateObjectId(id);
    const existingMenu = await this.weeklyMenuModel.findById(id).exec();

    if (!existingMenu) {
      throw new NotFoundException('Wochenkarte nicht gefunden');
    }

    await this.assertCanManageLocation(actor, existingMenu.locationId);
    await this.assertCanManageLocation(
      actor,
      updateWeeklyMenuDto.locationId ?? existingMenu.locationId,
    );

    try {
      const updatedMenu = await this.weeklyMenuModel
        .findByIdAndUpdate(id, this.normalizePayload(updateWeeklyMenuDto), {
          new: true,
          runValidators: true,
        })
        .exec();

      if (!updatedMenu) {
        throw new NotFoundException('Wochenkarte nicht gefunden');
      }

      return updatedMenu;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Für diese Filiale und Woche existiert bereits eine Wochenkarte');
      }

      throw error;
    }
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    this.validateObjectId(id);
    const menu = await this.weeklyMenuModel.findById(id).exec();

    if (!menu) {
      throw new NotFoundException('Wochenkarte nicht gefunden');
    }

    await this.assertCanManageLocation(actor, menu.locationId);
    await this.weeklyMenuModel.findByIdAndDelete(id).exec();
  }

  private normalizePayload(
    payload: CreateWeeklyMenuDto | UpdateWeeklyMenuDto,
  ): Record<string, unknown> {
    return {
      ...payload,
      ...(payload.weekStart ? { weekStart: new Date(payload.weekStart) } : {}),
      ...(payload.days
        ? {
            days: payload.days.map((day) => ({
              ...day,
              date: new Date(day.date),
              isActive: day.isActive ?? true,
              isVegetarian: day.isVegetarian ?? false,
            })),
          }
        : {}),
    };
  }

  private async assertCanManageLocation(
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
      throw new ForbiddenException('Filialleiter dürfen nur Wochenkarten eigener Filialen verwalten');
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
      throw new BadRequestException('Ungültige ID');
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
