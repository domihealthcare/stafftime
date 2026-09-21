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
  }
}
