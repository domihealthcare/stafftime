import { Role } from '@prisma/client';

/// The authenticated caller, attached to the request by the auth guard.
export interface AuthUser {
  id: string;
  email: string;
  /// What they may do on this request. While an admin is **viewing as**
  /// somebody (October 2026) this is the lower access level they chose, and
  /// `actualRole` says who they really are.
  role: Role;
  /// Set only while viewing as: the real access level (always ADMIN).
  actualRole?: Role;
  /// Set only while viewing as, when job roles were chosen: these stand in
  /// for their own job roles wherever the app reads the signed-in person's.
  viewAsJobRoleIds?: string[];
}

/**
 * Whether an admin is viewing the app as somebody else. While they are, the
 * per-person lists they are on (pay and the rota's cost, invoices, expense
 * approvals, provider productivity, News posting, everybody's schedule, the
 * people chosen to clear closing checklists) count as off, so the app shows
 * exactly what the person they chose would see (2 November 2026, Dominguez:
 * "the view-as.. is meant for me to be able to see everything exactly as they
 * would"). Back to yourself brings them back.
 */
export function isViewingAs(user: Pick<AuthUser, 'actualRole'> | null | undefined): boolean {
  return user?.actualRole !== undefined;
}

/// The view-as request headers an admin's browser sends (`lib/view-as.ts`).
export const VIEW_AS_HEADER = 'x-view-as';
export const VIEW_AS_JOB_ROLES_HEADER = 'x-view-as-job-roles';

/// Sent by the web's own polls (`request(..., { background: true })`), so the
/// session guard does not count them as use. See `isBackground`.
export const BACKGROUND_HEADER = 'x-background-request';

/// A kiosk-authenticated request carries a device, not a person.
export interface KioskDeviceContext {
  deviceId: string;
  deviceName: string;
  locationId: string;
  locationName: string;
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
    /// The raw session token, so a handler can revoke or preserve this session.
    sessionToken?: string;
    /// Set by KioskDeviceGuard. Never set on an ordinary user request.
    kiosk?: KioskDeviceContext;
  }
}
