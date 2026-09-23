import { PracticeSettings } from '@prisma/client';
import { PracticeSettingsService } from './practice-settings.service';

/**
 * A stand-in for the practice's settings in unit tests.
 *
 * Shared rather than re-invented per spec so that a test asserting "warns past
 * forty" is using the same forty the app defaults to. A spec that cares about a
 * different threshold passes one in and says so.
 */
export function fakeSettings(over: Partial<PracticeSettings> = {}): PracticeSettingsService {
  const settings = {
    id: 'settings-1',
    singleton: 1,
    overtimeThresholdHours: 40,
    rotaWarningDays: 4,
    payPeriodStart: null,
    updatedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } satisfies PracticeSettings;

  return {
    get: async () => settings,
    update: async () => settings,
  } as unknown as PracticeSettingsService;
}
