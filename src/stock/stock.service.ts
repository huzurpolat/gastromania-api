import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Observable, Subject, filter, from, map, switchMap } from 'rxjs';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { Location, LocationDocument } from '../locations/schemas/location.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';
import { StockItem, StockItemDocument } from './schemas/stock-item.schema';
import {
  StockMovement,
  StockMovementDocument,
} from './schemas/stock-movement.schema';

export interface StockItemResponse {
  _id: string;
  locationId: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  targetQuantity?: number;
  supplierId?: string;
  supplierName?: string;
  storageLocation?: string;
  note?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StockMovementResponse {
  _id: string;
  locationId: string;
  stockItemId: string;
  stockItemName: string;
  type: string;
  quantityChange: number;
  quantityAfter: number;
  note?: string;
  actorId: string;
  createdAt?: string;
}

export interface StockEvent {
  type: 'created' | 'updated' | 'adjusted' | 'deleted';
  item: StockItemResponse;
  movement?: StockMovementResponse;
}

@Injectable()
export class StockService {
  private readonly stockEvents$ = new Subject<StockEvent>();

  constructor(
    @InjectModel(StockItem.name)
    private readonly stockItemModel: Model<StockItemDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
  ) {}

  async create(
    payload: CreateStockItemDto,
    actor: AuthenticatedUser,
  ): Promise<StockItemResponse> {
    await this.assertCanUseLocation(actor, payload.locationId);

    const item = await this.stockItemModel.create(payload);
    const response = this.toItemResponse(item);
    this.stockEvents$.next({ type: 'created', item: response });
    return response;
  }

  async findAll(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<StockItemResponse[]> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);

    await Promise.all(locationIds.map((id) => this.assertCanUseLocation(actor, id)));

    const items = await this.stockItemModel
      .find({ locationId: { $in: locationIds } })
      .sort({ category: 1, name: 1 })
      .exec();

    return items.map((item) => this.toItemResponse(item));
  }

  async findMovements(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<StockMovementResponse[]> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);

    await Promise.all(locationIds.map((id) => this.assertCanUseLocation(actor, id)));

    const movements = await this.movementModel
      .find({ locationId: { $in: locationIds } })
      .sort({ createdAt: -1 })
      .limit(80)
      .exec();

    return movements.map((movement) => this.toMovementResponse(movement));
  }

  async update(
    id: string,
    payload: UpdateStockItemDto,
    actor: AuthenticatedUser,
  ): Promise<StockItemResponse> {
    const item = await this.stockItemModel.findById(id).exec();

    if (!item) {
      throw new NotFoundException('Lagerartikel nicht gefunden');
    }

    await this.assertCanUseLocation(actor, item.locationId);

    if (payload.locationId && payload.locationId !== item.locationId) {
      await this.assertCanUseLocation(actor, payload.locationId);
    }

    item.set(payload);
    const saved = await item.save();
    const response = this.toItemResponse(saved);
    this.stockEvents$.next({ type: 'updated', item: response });
    return response;
  }

  async adjust(
    id: string,
    payload: AdjustStockDto,
    actor: AuthenticatedUser,
  ): Promise<StockEvent> {
    const item = await this.stockItemModel.findById(id).exec();

    if (!item) {
      throw new NotFoundException('Lagerartikel nicht gefunden');
    }

    await this.assertCanUseLocation(actor, item.locationId);

    const nextQuantity = item.quantity + payload.quantityChange;

    if (nextQuantity < 0) {
      throw new BadRequestException('Bestand darf nicht negativ werden');
    }

    item.quantity = nextQuantity;
    const saved = await item.save();
    const movement = await this.movementModel.create({
      locationId: saved.locationId,
      stockItemId: saved._id.toString(),
      stockItemName: saved.name,
      type: payload.type,
      quantityChange: payload.quantityChange,
      quantityAfter: saved.quantity,
      note: payload.note,
      actorId: actor.sub,
    });
    const event = {
      type: 'adjusted' as const,
      item: this.toItemResponse(saved),
      movement: this.toMovementResponse(movement),
    };

    this.stockEvents$.next(event);
    return event;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<StockItemResponse> {
    const item = await this.stockItemModel.findById(id).exec();

    if (!item) {
      throw new NotFoundException('Lagerartikel nicht gefunden');
    }

    await this.assertCanUseLocation(actor, item.locationId);
    await this.stockItemModel.deleteOne({ _id: id }).exec();

    const response = this.toItemResponse(item);
    this.stockEvents$.next({ type: 'deleted', item: response });
    return response;
  }

  stream(actor: AuthenticatedUser): Observable<MessageEvent> {
    return from(this.getReadableLocationIds(actor)).pipe(
      switchMap((locationIds) =>
        this.stockEvents$.pipe(
          filter((event) => locationIds.includes(event.item.locationId)),
          map((event) => ({ data: event }) as MessageEvent),
        ),
      ),
    );
  }

  private async assertCanUseLocation(
    actor: AuthenticatedUser,
    locationId: string,
  ): Promise<void> {
    if (actor.roles.includes(Role.Admin)) {
      return;
    }

    const locationIds = await this.getReadableLocationIds(actor);

    if (!locationIds.includes(locationId)) {
      throw new ForbiddenException('Kein Zugriff auf diese Filiale');
    }
  }

  private async getReadableLocationIds(actor: AuthenticatedUser): Promise<string[]> {
    if (actor.roles.includes(Role.Admin)) {
      const locations = await this.locationModel.find().select('_id').exec();
      return locations.map((location) => location._id.toString());
    }

    const user = await this.userModel
      .findById(actor.sub)
      .select('locationId locationIds')
      .exec();
    const ownLocationIds = user
      ? [
          ...new Set([
            ...(user.locationIds ?? []),
            ...(user.locationId ? [user.locationId] : []),
          ]),
        ].map((id) => id.toString())
      : [];
    const managedLocationIds = actor.roles.includes(Role.Filialleiter)
      ? await this.getManagedLocationIds(actor.sub)
      : [];

    return [...new Set([...ownLocationIds, ...managedLocationIds])];
  }

  private async getManagedLocationIds(managerId: string): Promise<string[]> {
    const locations = await this.locationModel
      .find({ managerId })
      .select('_id')
      .exec();

    return locations.map((location) => location._id.toString());
  }

  private toItemResponse(item: StockItemDocument): StockItemResponse {
    const timestamped = item as StockItemDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };

    return {
      _id: item._id.toString(),
      locationId: item.locationId,
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity: item.quantity,
      minQuantity: item.minQuantity,
      targetQuantity: item.targetQuantity,
      supplierId: item.supplierId,
      supplierName: item.supplierName,
      storageLocation: item.storageLocation,
      note: item.note,
      isActive: item.isActive,
      createdAt: timestamped.createdAt?.toISOString(),
      updatedAt: timestamped.updatedAt?.toISOString(),
    };
  }

  private toMovementResponse(
    movement: StockMovementDocument,
  ): StockMovementResponse {
    const timestamped = movement as StockMovementDocument & { createdAt?: Date };

    return {
      _id: movement._id.toString(),
      locationId: movement.locationId,
      stockItemId: movement.stockItemId,
      stockItemName: movement.stockItemName,
      type: movement.type,
      quantityChange: movement.quantityChange,
      quantityAfter: movement.quantityAfter,
      note: movement.note,
      actorId: movement.actorId,
      createdAt: timestamped.createdAt?.toISOString(),
    };
  }
}
