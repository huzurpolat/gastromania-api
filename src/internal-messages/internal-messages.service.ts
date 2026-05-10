import {
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
import { CreateInternalMessageDto } from './dto/create-internal-message.dto';
import {
  InternalMessage,
  InternalMessageDocument,
  InternalMessagePriority,
} from './schemas/internal-message.schema';

export interface InternalMessageResponse {
  _id: string;
  locationId: string;
  senderId: string;
  senderName: string;
  senderRoles: Role[];
  targetRoles: Role[];
  message: string;
  priority: InternalMessagePriority;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable()
export class InternalMessagesService {
  private readonly messageCreated$ = new Subject<InternalMessageResponse>();

  constructor(
    @InjectModel(InternalMessage.name)
    private readonly messageModel: Model<InternalMessageDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Location.name)
    private readonly locationModel: Model<LocationDocument>,
  ) {}

  async create(
    payload: CreateInternalMessageDto,
    actor: AuthenticatedUser,
  ): Promise<InternalMessageResponse> {
    this.assertCanSend(actor);
    await this.assertCanUseLocation(actor, payload.locationId);

    const sender = await this.userModel.findById(actor.sub).exec();

    if (!sender) {
      throw new NotFoundException('Absender nicht gefunden');
    }

    const message = await this.messageModel.create({
      locationId: payload.locationId,
      senderId: actor.sub,
      senderName: this.getUserName(sender),
      senderRoles: actor.roles,
      targetRoles: payload.targetRoles ?? [],
      message: payload.message,
      priority: payload.priority ?? InternalMessagePriority.Normal,
    });
    const response = this.toResponse(message);

    this.messageCreated$.next(response);

    return response;
  }

  async findAll(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<InternalMessageResponse[]> {
    const locationIds = locationId
      ? [locationId]
      : await this.getReadableLocationIds(actor);

    await Promise.all(
      locationIds.map((id) => this.assertCanUseLocation(actor, id)),
    );

    const messages = await this.messageModel
      .find({
        locationId: { $in: locationIds },
        $or: [{ targetRoles: { $size: 0 } }, { targetRoles: { $in: actor.roles } }],
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();

    return messages.map((message) => this.toResponse(message)).reverse();
  }

  stream(actor: AuthenticatedUser): Observable<MessageEvent> {
    return from(this.getReadableLocationIds(actor)).pipe(
      switchMap((readableLocationIds) =>
        this.messageCreated$.pipe(
          filter(
            (message) =>
              readableLocationIds.includes(message.locationId) &&
              this.canReceive(actor, message),
          ),
          map((message) => ({ data: message }) as MessageEvent),
        ),
      ),
    );
  }

  private assertCanSend(actor: AuthenticatedUser): void {
    const canSend = [Role.Admin, Role.Filialleiter, Role.Service].some((role) =>
      actor.roles.includes(role),
    );

    if (!canSend) {
      throw new ForbiddenException(
        'Nur Admin, Filialleiter und Service duerfen Push-Nachrichten senden',
      );
    }
  }

  private async assertCanUseLocation(
    actor: AuthenticatedUser,
    locationId: string,
    allowAdmin = true,
  ): Promise<void> {
    if (allowAdmin && actor.roles.includes(Role.Admin)) {
      return;
    }

    const locationIds = await this.getUserLocationIds(actor.sub);
    const managedLocationIds = actor.roles.includes(Role.Filialleiter)
      ? await this.getManagedLocationIds(actor.sub)
      : [];
    const readableLocationIds = [...new Set([...locationIds, ...managedLocationIds])];

    if (!readableLocationIds.includes(locationId)) {
      throw new ForbiddenException('Kein Zugriff auf diese Filiale');
    }
  }

  private async getReadableLocationIds(actor: AuthenticatedUser): Promise<string[]> {
    if (actor.roles.includes(Role.Admin)) {
      const locations = await this.locationModel.find().select('_id').exec();

      return locations.map((location) => location._id.toString());
    }

    const locationIds = await this.getUserLocationIds(actor.sub);
    const managedLocationIds = actor.roles.includes(Role.Filialleiter)
      ? await this.getManagedLocationIds(actor.sub)
      : [];

    return [...new Set([...locationIds, ...managedLocationIds])];
  }

  private async getUserLocationIds(userId: string): Promise<string[]> {
    const user = await this.userModel.findById(userId).select('locationId locationIds').exec();

    if (!user) {
      return [];
    }

    return [
      ...new Set([
        ...(user.locationIds ?? []),
        ...(user.locationId ? [user.locationId] : []),
      ]),
    ].map((id) => id.toString());
  }

  private async getManagedLocationIds(managerId: string): Promise<string[]> {
    const locations = await this.locationModel
      .find({ managerId })
      .select('_id')
      .exec();

    return locations.map((location) => location._id.toString());
  }

  private canReceive(
    actor: AuthenticatedUser,
    message: InternalMessageResponse,
  ): boolean {
    const targetMatches =
      !message.targetRoles.length ||
      message.targetRoles.some((role) => actor.roles.includes(role));

    return targetMatches;
  }

  private getUserName(user: UserDocument): string {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');

    return name.trim() || user.email;
  }

  private toResponse(
    message: InternalMessageDocument,
  ): InternalMessageResponse {
    const timestampedMessage = message as InternalMessageDocument & {
      createdAt?: Date;
      updatedAt?: Date;
    };

    return {
      _id: message._id.toString(),
      locationId: message.locationId,
      senderId: message.senderId,
      senderName: message.senderName,
      senderRoles: message.senderRoles,
      targetRoles: message.targetRoles,
      message: message.message,
      priority: message.priority,
      createdAt: timestampedMessage.createdAt?.toISOString(),
      updatedAt: timestampedMessage.updatedAt?.toISOString(),
    };
  }
}
