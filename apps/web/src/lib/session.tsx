import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, SESSION_ENDED, api } from './api';
import { setLanguage } from './i18n';
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
      const me = await api.me();
      // Their own language, chosen on any device, wins once they are known.
      if (me.language) setLanguage(me.language);
      setEmployee(me);
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
    // Offline or a server error: show the sign-in screen rather than an
    // unhandled rejection.
    void refresh()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [refresh]);

  // The session ended while the app was open: back to the sign-in screen.
  useEffect(() => {
    const ended = () => setEmployee(null);
    window.addEventListener(SESSION_ENDED, ended);
    return () => window.removeEventListener(SESSION_ENDED, ended);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const me = await api.login(email, password);
    if (me.language) setLanguage(me.language);
    setEmployee(me);
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
