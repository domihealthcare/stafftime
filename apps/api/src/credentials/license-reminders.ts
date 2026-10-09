import { CredentialReminderStage } from '@prisma/client';

/**
 * Reminders to the person whose license or certificate runs out (October 2026,
 * Dominguez — making the app smarter). Managers were already told, in the
 * nightly email and on the Licenses banner; now the holder is too, so they can
 * renew before anybody has to chase them.
 *
 * Three moments, each said once for a given expiry date: **60 days** to go,
 * **30 days** to go, and **lapsed** (up to 30 days after — a card that ran out
 * long ago and was never archived is the managers' list's business, not a
 * surprise message). Only the most pressing stage that applies is sent: a
 * license first seen 10 days out gets the 30-day reminder, not both.
 *
 * Pure: `LicenseRemindersService` reads the credentials and what has been
 * sent, and records each before it goes.
 */

export const REMIND_DAYS_EARLY = 60;
export const REMIND_DAYS_LATE = 30;
/// Lapsed ones are mentioned for this long after the date, then left to the
/// managers' list.
export const LAPSED_FOR_DAYS = 30;

export interface ReminderCredential {
  id: string;
  employeeId: string;
  name: string;
  credentialTypeId: string | null;
  /// The license type's name, for matching a renewal recorded free-hand.
  typeName: string | null;
  /// Plain date, "YYYY-MM-DD".
  expiresOn: string;
}

export interface DueReminder {
  credential: ReminderCredential;
  stage: CredentialReminderStage;
  /// Days from today to the expiry date; negative once it has lapsed.
  daysLeft: number;
}

/// What is due today, before checking what was already sent.
export function dueReminders(credentials: ReminderCredential[], today: string): DueReminder[] {
  return credentials.flatMap((credential) => {
    if (supersededBy(credential, credentials)) return [];
    const daysLeft = daysBetween(today, credential.expiresOn);
    const stage = stageFor(daysLeft);
    return stage ? [{ credential, stage, daysLeft }] : [];
  });
}

export function stageFor(daysLeft: number): CredentialReminderStage | null {
  if (daysLeft < -LAPSED_FOR_DAYS) return null;
  if (daysLeft < 0) return CredentialReminderStage.LAPSED;
  if (daysLeft <= REMIND_DAYS_LATE) return CredentialReminderStage.DAYS_30;
  if (daysLeft <= REMIND_DAYS_EARLY) return CredentialReminderStage.DAYS_60;
  return null;
}

/// A renewal recorded beside the old card: the same person, the same kind of
/// license, running longer. The old one is not
/// worth a reminder — the same rule the Licenses screen uses for standing.
function supersededBy(credential: ReminderCredential, all: ReminderCredential[]): boolean {
  const key = sameKindKey(credential);
  return all.some(
    (other) =>
      other.id !== credential.id &&
      other.employeeId === credential.employeeId &&
      other.expiresOn > credential.expiresOn &&
      sameKindKey(other) === key,
  );
}

/// By the type's name when it has one, else its own: a renewal recorded
/// free-hand as "DEA" replaces a card recorded as the DEA type.
function sameKindKey(credential: ReminderCredential): string {
  return (credential.typeName ?? credential.name).trim().toLowerCase();
}

/// The words, for the bell and the email.
export function reminderWording(
  name: string,
  stage: CredentialReminderStage,
  daysLeft: number,
  expiresOn: string,
): { title: string; body: string } {
  const on = new Date(`${expiresOn}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const days = `${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  if (stage === CredentialReminderStage.LAPSED) {
    return {
      title: `Your ${name} has expired`,
      body: `It ran out on ${on}. Once it is renewed, give a manager the new expiry date so it is updated here.`,
    };
  }
  return {
    title: daysLeft === 0 ? `Your ${name} expires today` : `Your ${name} expires in ${days}`,
    body: `It runs out on ${on}. Once it is renewed, give a manager the new expiry date so it is updated here.`,
  };
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
