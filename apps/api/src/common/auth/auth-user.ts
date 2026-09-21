import { Role } from '@prisma/client';

/// The authenticated caller, attached to the request by the auth guard.
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
    /// The raw session token, so a handler can revoke or preserve this session.
    sessionToken?: string;
  }
}
