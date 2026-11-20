import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { SystemConfigStatus, UserProfile } from '../shared/types';
import { apiFetch } from '../lib/apiClient';
import { getSupabaseClient } from '../lib/supabase';

interface AuthContextValue {
  user: UserProfile | null;
  configStatus: SystemConfigStatus | null;
  loading: boolean;
  authError: string | null;
  sandboxAccounts: UserProfile[];
  signInWithGoogle: () => Promise<void>;
  signInSandbox: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [configStatus, setConfigStatus] = useState<SystemConfigStatus | null>(null);
  const [sandboxAccounts, setSandboxAccounts] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadCurrentUser = useCallback(async () => {
    try {
      const status = await apiFetch<SystemConfigStatus>('/system/config-status');
      setConfigStatus(status);

      if (!status.supabaseConfigured) {
        const sb = await apiFetch<{ users: UserProfile[] }>('/auth/sandbox-accounts');
        setSandboxAccounts(sb.users || []);
      }

      try {
        const me = await apiFetch<{ user: UserProfile }>('/auth/me');
        setUser(me.user);
        setAuthError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('Akses ditolak') || msg.includes('@')) {
          setAuthError(msg);
          const supabase = getSupabaseClient();
          if (supabase) await supabase.auth.signOut();
        }
        setUser(null);
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Gagal menghubungi server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentUser();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'SIGNED_OUT') {
        loadCurrentUser();
      }
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [loadCurrentUser]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setAuthError('Kredensial Supabase (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY) belum dikonfigurasi.');
      return;
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          hd: configStatus?.allowedDomain || 'lazuardi.sch.id',
          prompt: 'select_account',
        },
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    if (data?.url) {
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.assign(data.url);
          return;
        }
      } catch {
        // Fallback to current frame navigation when top frame is cross-origin
      }
      window.location.assign(data.url);
    }
  }, [configStatus]);

  const signInSandbox = useCallback(async (userId: string) => {
    setAuthError(null);
    const res = await apiFetch<{ user: UserProfile }>('/auth/sandbox-login', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        configStatus,
        loading,
        authError,
        sandboxAccounts,
        signInWithGoogle,
        signInSandbox,
        logout,
        refreshSession: loadCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
