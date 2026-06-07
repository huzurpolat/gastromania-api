import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { DEFAULT_MODULES } from './constants/module-definitions';
import { ModulesService } from './modules.service';
import { SystemModuleDocument } from './schemas/system-module.schema';
import { TenantModuleDocument } from './schemas/tenant-module.schema';
import { TenantDocument } from '../tenants/schemas/tenant.schema';

type QueryMock<T> = {
  exec: jest.Mock<Promise<T>, []>;
};

type ModuleDocumentMock = {
  key: string;
  name: string;
  description: string;
  category: string;
  defaultEnabled: boolean;
  systemLocked: boolean;
  sortOrder: number;
  _id: { toString: () => string };
  createdAt?: Date;
  updatedAt?: Date;
  save: jest.Mock<Promise<ModuleDocumentMock>, []>;
};

const query = <T>(value: T): QueryMock<T> => ({
  exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
});

const leanQuery = <T>(value: T) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
});

const createDocument = (
  overrides: Partial<ModuleDocumentMock> = {},
): ModuleDocumentMock => {
  const document: ModuleDocumentMock = {
    key: 'counter_orders',
    name: 'Thekenbestellung',
    description: 'Thekenbestellung',
    category: 'Betrieb',
    defaultEnabled: true,
    systemLocked: false,
    sortOrder: 20,
    _id: { toString: () => 'module-1' },
    save: jest.fn<Promise<ModuleDocumentMock>, []>(),
    ...overrides,
  };

  document.save.mockResolvedValue(document);

  return document;
};

const createService = (
  model: Partial<{
    findOne: jest.Mock;
    updateOne: jest.Mock;
    find: jest.Mock;
  }>,
  tenantModuleModel: Partial<{
    findOne: jest.Mock;
    updateOne: jest.Mock;
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
  }> = {},
  tenantModel: Partial<{
    findById: jest.Mock;
  }> = {},
): ModulesService =>
  new ModulesService(
    model as unknown as Model<SystemModuleDocument>,
    tenantModuleModel as unknown as Model<TenantModuleDocument>,
    tenantModel as unknown as Model<TenantDocument>,
  );

describe('ModulesService', () => {
  it('throws when a required module is checked without tenant context', async () => {
    const service = createService({
      findOne: jest.fn().mockReturnValue(query(createDocument())),
    });

    await expect(service.assertEnabled('counter_orders')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('updates only the selected tenant module state', async () => {
    const updateOne = jest.fn().mockReturnValue(query({ acknowledged: true }));
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValue(query({ moduleKey: 'counter_orders', enabled: false }));
    const service = createService(
      {
        findOne: jest.fn().mockReturnValue(query(createDocument())),
        updateOne,
      },
      {
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
        findOneAndUpdate,
      },
    );

    const result = await service.updateTenantModule(
      'tenant-a',
      'counter_orders',
      false,
    );

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant-a', moduleKey: 'counter_orders' },
      {
        $set: {
          tenantId: 'tenant-a',
          moduleKey: 'counter_orders',
          enabled: false,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    expect(result.enabled).toBe(false);
  });

  it('rejects tenant module updates for unknown module definitions', async () => {
    const service = createService(
      {
        findOne: jest.fn().mockReturnValue(query(null)),
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
      },
      {
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
      },
    );

    await expect(
      service.updateTenantModule('tenant-a', 'missing', false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('prevents disabling system locked tenant modules', async () => {
    const document = createDocument({ systemLocked: true });
    const findOneAndUpdate = jest.fn();
    const service = createService(
      {
        findOne: jest.fn().mockReturnValue(query(document)),
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
      },
      {
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
        findOneAndUpdate,
      },
    );

    await expect(
      service.updateTenantModule('tenant-a', 'module_management', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('throws when a tenant module is disabled', async () => {
    const updateOne = jest.fn().mockReturnValue(query({ acknowledged: true }));
    const service = createService(
      {
        findOne: jest
          .fn()
          .mockReturnValue(query(createDocument())),
        updateOne,
      },
      {
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
        findOne: jest
          .fn()
          .mockReturnValue(query({ moduleKey: 'counter_orders', enabled: false })),
      },
      {
        findById: jest
          .fn()
          .mockReturnValue(leanQuery({ status: 'active' })),
      },
    );

    await expect(
      service.assertEnabled('counter_orders', {
        sub: 'user-1',
        email: 'tenant@example.test',
        roles: ['TenantAdmin'],
        tenantId: 'tenant-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('checks module state for an explicit tenant context', async () => {
    const service = createService(
      {
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
      },
      {
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
        findOne: jest
          .fn()
          .mockReturnValue(query({ moduleKey: 'qr_orders', enabled: true })),
      },
      {
        findById: jest.fn().mockReturnValue(leanQuery({ status: 'active' })),
      },
    );

    await expect(
      service.assertEnabledForTenant('qr_orders', 'tenant-1'),
    ).resolves.toBeUndefined();
  });

  it('rejects explicit tenant module checks without tenant context', async () => {
    const service = createService(
      {
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
      },
      {
        updateOne: jest.fn().mockReturnValue(query({ acknowledged: true })),
      },
      {
        findById: jest.fn().mockReturnValue(leanQuery({ status: 'active' })),
      },
    );

    await expect(
      service.assertEnabledForTenant('qr_orders'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('seeds module definitions without a global enabled state', async () => {
    const updateOne = jest.fn().mockReturnValue(query({ acknowledged: true }));
    const service = createService({
      updateOne,
    });

    await service.onModuleInit();

    expect(updateOne).toHaveBeenCalledTimes(DEFAULT_MODULES.length);
    expect(updateOne).toHaveBeenCalledWith(
      { key: 'counter_orders' },
      expect.objectContaining({
        $set: expect.objectContaining({
          name: expect.any(String),
          description: expect.any(String),
          category: expect.any(String),
          defaultEnabled: true,
          systemLocked: false,
          sortOrder: expect.any(Number),
        }),
        $setOnInsert: expect.objectContaining({
          key: 'counter_orders',
        }),
      }),
      { upsert: true },
    );
  });
});
