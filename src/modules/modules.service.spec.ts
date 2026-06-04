import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { DEFAULT_MODULES } from './constants/module-definitions';
import { ModulesService } from './modules.service';
import { SystemModuleDocument } from './schemas/system-module.schema';

type QueryMock<T> = {
  exec: jest.Mock<Promise<T>, []>;
};

type ModuleDocumentMock = {
  enabled: boolean;
  systemLocked: boolean;
  save: jest.Mock<Promise<ModuleDocumentMock>, []>;
};

const query = <T>(value: T): QueryMock<T> => ({
  exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
});

const createDocument = (
  overrides: Partial<ModuleDocumentMock> = {},
): ModuleDocumentMock => {
  const document: ModuleDocumentMock = {
    enabled: true,
    systemLocked: false,
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
): ModulesService =>
  new ModulesService(model as unknown as Model<SystemModuleDocument>);

describe('ModulesService', () => {
  it('updates only the enabled state of an existing module', async () => {
    const document = createDocument({ enabled: true });
    const model = {
      findOne: jest.fn().mockReturnValue(query(document)),
    };
    const service = createService(model);

    const result = await service.updateEnabled('counter_orders', false);

    expect(model.findOne).toHaveBeenCalledWith({ key: 'counter_orders' });
    expect(document.enabled).toBe(false);
    expect(document.save).toHaveBeenCalledTimes(1);
    expect(result).toBe(document);
  });

  it('rejects updates for unknown modules', async () => {
    const service = createService({
      findOne: jest.fn().mockReturnValue(query(null)),
    });

    await expect(service.updateEnabled('missing', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('prevents disabling system locked modules', async () => {
    const document = createDocument({ systemLocked: true });
    const service = createService({
      findOne: jest.fn().mockReturnValue(query(document)),
    });

    await expect(
      service.updateEnabled('module_management', false),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(document.save).not.toHaveBeenCalled();
  });

  it('allows keeping system locked modules enabled', async () => {
    const document = createDocument({ systemLocked: true });
    const service = createService({
      findOne: jest.fn().mockReturnValue(query(document)),
    });

    await service.updateEnabled('module_management', true);

    expect(document.enabled).toBe(true);
    expect(document.save).toHaveBeenCalledTimes(1);
  });

  it('throws when a required module is disabled', async () => {
    const service = createService({
      findOne: jest.fn().mockReturnValue(query(createDocument({ enabled: false }))),
    });

    await expect(service.assertEnabled('counter_orders')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('seeds default modules without overwriting existing enabled values', async () => {
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
          systemLocked: false,
        }),
        $setOnInsert: expect.objectContaining({
          key: 'counter_orders',
          enabled: true,
        }),
      }),
      { upsert: true },
    );
  });
});
