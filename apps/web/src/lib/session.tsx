import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api, isPasswordChangeRequired } from './api';
import type { Employee } from './types';

interface SessionValue {
  employee: Employee | null;
  loading: boolean;
  /// True when a temporary password is still in force: the app shows nothing
  /// but the change-password screen until it is replaced.
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setEmployee(await api.me());
    } catch (error) {
      // 401 is the ordinary "not signed in" answer, not a failure worth showing.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setEmployee(null);
      } else {
        throw error;
      }
    }
  }, []);

  useEffect(() => {
    // The cookie may already be valid from a previous visit, so ask the server
    // who we are before deciding to show the sign-in screen.
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    setEmployee(await api.login(email, password));
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      // Whatever the server said, stop showing signed-in state.
      setEmployee(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      employee,
      loading,
      mustChangePassword: employee?.mustChangePassword ?? false,
      signIn,
      signOut,
      refresh,
    }),
    [employee, loading, signIn, signOut, refresh],
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

export function useIsAdmin(): boolean {
  const { employee } = useSession();
  return employee?.role === 'ADMIN';
}

export { isPasswordChangeRequired };
