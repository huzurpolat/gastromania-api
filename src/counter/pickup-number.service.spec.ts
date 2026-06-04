/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { PickupNumberService } from './pickup-number.service';

describe('PickupNumberService', () => {
  const settingsModel = {
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const sequenceModel = {
    findOneAndUpdate: jest.fn(),
    create: jest.fn(),
  };
  const accessPolicy = {
    assertCanAccessLocation: jest.fn(),
    assertCanManageLocation: jest.fn(),
  };

  const execResult = <T>(value: T) => ({
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates daily pickup numbers with configured prefix and padding', async () => {
    const service = new PickupNumberService(
      settingsModel as never,
      sequenceModel as never,
      accessPolicy as never,
    );

    settingsModel.findOneAndUpdate.mockReturnValue(
      execResult({
        pickupPrefix: 'B',
        pickupStartNumber: 1,
        pickupNumberLength: 4,
        dailyResetEnabled: true,
      }),
    );
    sequenceModel.findOneAndUpdate.mockReturnValue(
      execResult({
        currentNumber: 7,
        minLength: 4,
        lastPickupNumber: undefined,
        save: jest.fn().mockResolvedValue(undefined),
      }),
    );

    await expect(
      service.nextPickupNumber('location-1', 'company-1'),
    ).resolves.toBe('B0007');
  });

  it('creates the initial pickup number sequence without conflicting update operators', async () => {
    const service = new PickupNumberService(
      settingsModel as never,
      sequenceModel as never,
      accessPolicy as never,
    );

    settingsModel.findOneAndUpdate.mockReturnValue(
      execResult({
        pickupPrefix: 'C',
        pickupStartNumber: 10,
        pickupNumberLength: 3,
        dailyResetEnabled: true,
      }),
    );
    sequenceModel.findOneAndUpdate.mockReturnValue(execResult(null));
    sequenceModel.create.mockResolvedValue({
      currentNumber: 10,
      minLength: 3,
      lastPickupNumber: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      service.nextPickupNumber('location-1', 'company-1'),
    ).resolves.toBe('C010');

    expect(sequenceModel.findOneAndUpdate.mock.calls[0][1]).toEqual({
      $inc: { currentNumber: 1 },
      $set: { companyId: 'company-1', minLength: 3 },
    });
    expect(sequenceModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        currentNumber: 10,
        minLength: 3,
        prefix: 'C',
      }),
    );
  });

  it('creates default settings for a location', async () => {
    const service = new PickupNumberService(
      settingsModel as never,
      sequenceModel as never,
      accessPolicy as never,
    );
    const settings = { locationId: 'location-1', pickupPrefix: 'A' };
    settingsModel.findOneAndUpdate.mockReturnValue(execResult(settings));

    await expect(service.getSettings('location-1')).resolves.toBe(settings);
    const [query, update, options] = settingsModel.findOneAndUpdate.mock
      .calls[0] as [
      { locationId: string },
      { $setOnInsert: { pickupPrefix: string; dailyResetEnabled: boolean } },
      { upsert: boolean },
    ];

    expect(query).toEqual({ locationId: 'location-1' });
    expect(update.$setOnInsert).toMatchObject({
      pickupPrefix: 'A',
      dailyResetEnabled: true,
    });
    expect(options).toMatchObject({ upsert: true });
  });
});
