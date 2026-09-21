import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api, getDevEmployeeId, setDevEmployeeId } from './api';
import type { Employee } from './types';

interface SessionValue {
  employee: Employee | null;
  loading: boolean;
  error: string | null;
  signInAs: (employeeId: string) => void;
  signOut: () => void;
  refresh: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Holds the signed-in employee.
 *
 * While auth is stubbed "signing in" is choosing an employee id, which the API
 * client sends as a header. The shape of this context is what real login will
 * fill, so screens consuming it will not change.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    if (!getDevEmployeeId()) {
      setEmployee(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    api
      .me()
      .then((me) => {
        if (!cancelled) {
          setEmployee(me);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        // A stale id from a reseeded database should not wedge the app.
        if (err instanceof ApiError && err.status === 401) {
          setDevEmployeeId(null);
          setEmployee(null);
          setError(null);
        } else {
          setError(err instanceof Error ? err.message : 'Could not load your account.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const signInAs = useCallback((employeeId: string) => {
    setDevEmployeeId(employeeId);
    setNonce((n) => n + 1);
  }, []);

  const signOut = useCallback(() => {
    setDevEmployeeId(null);
    setEmployee(null);
  }, []);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo(
    () => ({ employee, loading, error, signInAs, signOut, refresh }),
    [employee, loading, error, signInAs, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside a SessionProvider');
  }
  return context;
}

/// Managers and admins see the whole practice; employees see themselves.
export function useIsManager(): boolean {
  const { employee } = useSession();
  return employee?.role === 'MANAGER' || employee?.role === 'ADMIN';
}
