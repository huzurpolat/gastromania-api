import { PickupNumberService } from './pickup-number.service';

describe('PickupNumberService', () => {
  const settingsModel = {
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const sequenceModel = {
    findOneAndUpdate: jest.fn(),
  };
  const accessPolicy = {
    assertCanAccessLocation: jest.fn(),
    assertCanManageLocation: jest.fn(),
  };

  const execResult = <T>(value: T) => ({ exec: jest.fn().mockResolvedValue(value) });

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

    await expect(service.nextPickupNumber('location-1', 'company-1')).resolves.toBe('B0007');
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
    expect(settingsModel.findOneAndUpdate).toHaveBeenCalledWith(
      { locationId: 'location-1' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          pickupPrefix: 'A',
          dailyResetEnabled: true,
        }),
      }),
      expect.objectContaining({ upsert: true }),
    );
  });
});
