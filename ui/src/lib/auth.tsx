import * as React from "react";
import { authApi } from "@/lib/adapters/auth";
import type { Profile, SessionInfo } from "@/lib/adapters";

export type User = Profile;

interface AuthState {
  user: User | null;
  session: SessionInfo | null;
  status: "loading" | "authenticated" | "anonymous";
}

interface AuthContextValue extends AuthState {
  loginWithPassword: (email: string, password: string) => Promise<SessionInfo>;
  signupWithPassword: (email: string, password: string, fullName?: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = React.createContext<AuthContextValue | null>(null);

function stateFromSession(session: SessionInfo | null): AuthState {
  return {
    user: session?.user ?? null,
    session,
    status: session ? "authenticated" : "anonymous",
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>({
    user: null,
    session: null,
    status: "loading",
  });

  const refresh = React.useCallback(async () => {
    try {
      const session = await authApi.getSession();
      setState(stateFromSession(session));
      return session;
    } catch {
      setState(stateFromSession(null));
      return null;
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    authApi
      .getSession()
      .then((session) => {
        if (active) setState(stateFromSession(session));
      })
      .catch(() => {
        if (active) setState(stateFromSession(null));
      });
    const onAuthChange = () => void refresh();
    window.addEventListener(authApi.eventName, onAuthChange);
    return () => {
      active = false;
      window.removeEventListener(authApi.eventName, onAuthChange);
    };
  }, [refresh]);

  const loginWithPassword = React.useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, status: "loading" }));
    const session = await authApi.login(email, password);
    setState(stateFromSession(session));
    return session;
  }, []);

  const signupWithPassword = React.useCallback(
    async (email: string, password: string, fullName?: string) => {
      setState((s) => ({ ...s, status: "loading" }));
      const session = await authApi.signup(email, password, fullName);
      setState(stateFromSession(session));
    },
    [],
  );

  const signInWithGoogle = React.useCallback(async () => {
    throw new Error("Google SSO is not connected to the 0101 backend yet.");
  }, []);

  const signInWithApple = React.useCallback(async () => {
    throw new Error("Apple SSO is not connected to the 0101 backend yet.");
  }, []);

  const sendPasswordReset = React.useCallback(async (email: string) => {
    await authApi.forgotPassword(email);
  }, []);

  const updatePassword = React.useCallback(async (password: string) => {
    await authApi.resetPassword(password);
  }, []);

  const logout = React.useCallback(async () => {
    await authApi.logout();
    setState(stateFromSession(null));
  }, []);

  const value: AuthContextValue = {
    ...state,
    loginWithPassword,
    signupWithPassword,
    signInWithGoogle,
    signInWithApple,
    sendPasswordReset,
    updatePassword,
    logout,
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
