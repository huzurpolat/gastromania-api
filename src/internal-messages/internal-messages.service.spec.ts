import { ForbiddenException } from '@nestjs/common';
import { AccessPolicyService } from '../access/access-policy.service';
import { Role } from '../auth/enums/role.enum';
import { AuthenticatedUser } from '../auth/types/authenticated-request.type';
import { InternalMessagesService } from './internal-messages.service';
import { InternalMessagePriority } from './schemas/internal-message.schema';

const query = <T>(value: T) => ({
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

describe('InternalMessagesService', () => {
  const actor: AuthenticatedUser = {
    sub: 'user-region-admin',
    email: 'admin@nrw.local',
    roles: [Role.RegionAdmin],
    companyId: 'company-gastrowerk',
    regionIds: ['region-nrw'],
    locationIds: [],
    managedLocationIds: [],
    permissions: ['internalMessages.create', 'internalMessages.view'],
  };
  const sender = {
    firstName: 'Nora',
    lastName: 'NRW',
    email: 'admin@nrw.local',
  };
  const messageDocument = {
    _id: { toString: () => 'message-nrw' },
    locationId: 'loc-bonn',
    senderId: actor.sub,
    senderName: 'Nora NRW',
    senderRoles: [Role.RegionAdmin],
    targetRoles: [Role.Service],
    message: 'Bitte Service vorbereiten',
    priority: InternalMessagePriority.Normal,
    createdAt: new Date('2026-01-01T10:00:00.000Z'),
    updatedAt: new Date('2026-01-01T10:00:00.000Z'),
  };

  let service: InternalMessagesService;
  let messageModel: {
    create: jest.Mock;
    find: jest.Mock;
  };
  let userModel: {
    findById: jest.Mock;
  };
  let accessPolicy: Pick<
    AccessPolicyService,
    | 'assertCanAccessLocation'
    | 'getReadableLocationIds'
    | 'isManagementRole'
    | 'isPlatformAdmin'
  >;

  beforeEach(() => {
    messageModel = {
      create: jest.fn().mockResolvedValue(messageDocument),
      find: jest.fn().mockReturnValue(query([messageDocument])),
    };
    userModel = {
      findById: jest.fn().mockReturnValue(query(sender)),
    };
    accessPolicy = {
      assertCanAccessLocation: jest.fn().mockResolvedValue(undefined),
      getReadableLocationIds: jest.fn().mockResolvedValue(['loc-bonn']),
      isManagementRole: jest.fn((user?: AuthenticatedUser) =>
        Boolean(user?.roles.includes(Role.RegionAdmin)),
      ),
      isPlatformAdmin: jest.fn().mockReturnValue(false),
    };

    service = new InternalMessagesService(
      messageModel as never,
      userModel as never,
      accessPolicy as AccessPolicyService,
    );
  });

  it('sends messages through the central location policy', async () => {
    await expect(
      service.create(
        {
          locationId: 'loc-bonn',
          targetRoles: [Role.Service],
          message: 'Bitte Service vorbereiten',
        },
        actor,
      ),
    ).resolves.toMatchObject({
      _id: 'message-nrw',
      locationId: 'loc-bonn',
      senderName: 'Nora NRW',
    });

    expect(accessPolicy.assertCanAccessLocation).toHaveBeenCalledWith(
      actor,
      'loc-bonn',
    );
    expect(messageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: 'loc-bonn',
        senderId: actor.sub,
        senderRoles: [Role.RegionAdmin],
      }),
    );
  });

  it('lists only readable scoped messages', async () => {
    await expect(service.findAll(actor)).resolves.toHaveLength(1);

    expect(accessPolicy.getReadableLocationIds).toHaveBeenCalledWith(actor);
    expect(accessPolicy.assertCanAccessLocation).toHaveBeenCalledWith(
      actor,
      'loc-bonn',
    );
    expect(messageModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: { $in: ['loc-bonn'] },
      }),
    );
  });

  it('blocks non-management users from sending messages unless they are service', async () => {
    const stockUser: AuthenticatedUser = {
      ...actor,
      sub: 'user-stock',
      email: 'lager@bonn.local',
      roles: [Role.Lager],
      locationIds: ['loc-bonn'],
    };

    await expect(
      service.create(
        {
          locationId: 'loc-bonn',
          targetRoles: [Role.Service],
          message: 'Bestand pruefen',
        },
        stockUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
