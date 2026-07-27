import { ForbiddenException } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import {
  CommunicationChannel,
  CommunicationProviderKey,
} from './schemas/communication-provider.schema';

describe('CommunicationService', () => {
  const actor = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    roles: ['TenantAdmin'],
    permissions: ['reservations.view'],
  };

  function chain<T>(value: T) {
    return {
      sort: jest.fn(() => ({
        lean: jest.fn(async () => value),
      })),
      lean: jest.fn(async () => value),
    };
  }

  function createService() {
    const providerDoc = {
      _id: 'provider-1',
      tenantId: 'tenant-1',
      type: CommunicationChannel.Email,
      provider: CommunicationProviderKey.Brevo,
      name: 'Brevo',
      active: true,
      config: {},
      toObject: jest.fn(function toObject(this: unknown) {
        return this;
      }),
      save: jest.fn(async function save(this: unknown) {
        return this;
      }),
    };
    const providerModel = {
      find: jest.fn(() => chain([])),
      create: jest.fn(async (payload) => ({ ...providerDoc, ...payload })),
      findOne: jest.fn(async () => providerDoc),
      findByIdAndUpdate: jest.fn((_id, payload) => ({
        lean: jest.fn(async () => ({ ...providerDoc, ...payload })),
      })),
    };
    const accessPolicy = {
      isCompanyAdmin: jest.fn(() => true),
    };
    const service = new CommunicationService(
      providerModel as never,
      accessPolicy as never,
    );

    return { service, providerModel, accessPolicy };
  }

  it('masks secret-like config fields instead of persisting clear text', async () => {
    const { service, providerModel } = createService();

    const provider = await service.createProvider(
      {
        type: CommunicationChannel.Email,
        provider: CommunicationProviderKey.Brevo,
        name: 'Brevo',
        config: {
          endpointUrl: 'https://example.test/send',
          apiKey: 'secret-value',
          secretEnvVar: 'BREVO_API_KEY',
        },
      },
      actor as never,
    );

    expect(providerModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        config: {
          endpointUrl: 'https://example.test/send',
          apiKeyMasked: '********',
          secretEnvVar: 'BREVO_API_KEY',
        },
      }),
    );
    expect(provider.config).not.toHaveProperty('apiKey');
  });

  it('blocks provider writes for non tenant management users', async () => {
    const { service, accessPolicy } = createService();
    accessPolicy.isCompanyAdmin.mockReturnValue(false);

    await expect(
      service.createProvider(
        {
          type: CommunicationChannel.Sms,
          provider: CommunicationProviderKey.Twilio,
          name: 'Twilio',
        },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
