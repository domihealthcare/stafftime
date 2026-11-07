import type { OnCallLayer } from '../on-call/call-routing-lookup';

/**
 * What the after-hours line should ring, worked out from the schedule.
 * CONTRACT between the on-call side (which reads the database:
 * `OnCallRoutingService.planAt`) and the phone line (which turns it into
 * TwiML). Phones are E.164 ("+12015550142"), only ever ones that can be
 * dialled.
 */

export interface RoutingContact {
  employeeId: string;
  name: string;
  phone: string;
}

export interface RoutingPlan {
  /// Who is on call, or the default provider when nobody is or theirs cannot
  /// be dialled. Null only when not even the default provider can be.
  onCall: RoutingContact | null;
  /// Their backup, when there is one that can be dialled and is not them.
  backup: RoutingContact | null;
  /// The default provider, tried last with the whisper (Dominguez, November
  /// 2026), when not already the on-call or the backup.
  fallback: RoutingContact | null;
  source: OnCallLayer;
  /// Plain words for anything skipped: "Dr. B has no phone number that can be
  /// dialled." For the log and the screen, never spoken.
  problems: string[];
}
