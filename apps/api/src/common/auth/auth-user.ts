import { Role } from '@prisma/client';

/// The authenticated caller, attached to the request by the auth guard.
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

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
