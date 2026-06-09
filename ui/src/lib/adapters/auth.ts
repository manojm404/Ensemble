/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Profile, SessionInfo } from "./types";

const ACCESS_TOKEN_KEY = "0101_auth_token";
const REFRESH_TOKEN_KEY = "0101_refresh_token";
const EXPIRES_AT_KEY = "0101_token_expires_at";
const USER_KEY = "0101_auth_user";
const AUTH_EVENT = "0101:auth";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const memoryStore = new Map<string, string>();
const WINDOW_MEMORY_KEY = "__0101AuthMemory";

const API_BASE = import.meta.env.VITE_API_URL ?? import.meta.env.VITE_API_BASE_URL ?? "";
const DIRECT_BACKEND_BASE = import.meta.env.VITE_DIRECT_API_URL ?? "http://127.0.0.1:8088";

function endpoint(path: string) {
  return `${API_BASE}${path}`;
}

function emitAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AUTH_EVENT));
  }
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly label: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function shouldUseDirectFallback(err: unknown) {
  return err instanceof TypeError || (err instanceof ApiRequestError && err.status === 404);
}

function saveSession(session: SessionInfo, options: { emit?: boolean } = {}) {
  const shouldEmit = options.emit ?? true;
  setStoredValue(ACCESS_TOKEN_KEY, session.access_token);
  if (session.refresh_token) setStoredValue(REFRESH_TOKEN_KEY, session.refresh_token);
  if (session.expires_at) setStoredValue(EXPIRES_AT_KEY, String(session.expires_at));
  setStoredValue(USER_KEY, JSON.stringify(session.user));
  if (shouldEmit) emitAuthChange();
}

function clearSession() {
  removeStoredValue(ACCESS_TOKEN_KEY);
  removeStoredValue(REFRESH_TOKEN_KEY);
  removeStoredValue(EXPIRES_AT_KEY);
  removeStoredValue(USER_KEY);
  emitAuthChange();
}

function getAccessToken() {
  return getStoredValue(ACCESS_TOKEN_KEY);
}

function getRefreshToken() {
  return getStoredValue(REFRESH_TOKEN_KEY);
}

function getExpiresAt() {
  const raw = getStoredValue(EXPIRES_AT_KEY);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getCachedUser(): Profile | null {
  const raw = getStoredValue(USER_KEY);
  if (!raw) return null;
  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    removeStoredValue(USER_KEY);
    return null;
  }
}

function setStoredValue(key: string, value: string) {
  memoryStore.set(key, value);
  getWindowMemory().set(key, value);
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Cookie fallback below keeps auth usable in restricted storage contexts.
  }
  try {
    document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_SECONDS}`;
  } catch {
    // If both browser stores are unavailable, the caller will still finish without crashing.
  }
}

function getStoredValue(key: string) {
  const memoryValue = memoryStore.get(key);
  if (memoryValue) return memoryValue;
  const windowMemoryValue = getWindowMemory().get(key);
  if (windowMemoryValue) return windowMemoryValue;

  try {
    const value = window.localStorage?.getItem(key);
    if (value) return value;
  } catch {
    // Continue to cookie fallback.
  }
  try {
    const prefix = `${key}=`;
    const cookie = document.cookie
      .split("; ")
      .find((part) => part.startsWith(prefix))
      ?.slice(prefix.length);
    return cookie ? decodeURIComponent(cookie) : null;
  } catch {
    return null;
  }
}

function removeStoredValue(key: string) {
  memoryStore.delete(key);
  getWindowMemory().delete(key);
  try {
    window.localStorage?.removeItem(key);
  } catch {
    // Continue to cookie cleanup.
  }
  try {
    document.cookie = `${key}=; Path=/; SameSite=Lax; Max-Age=0`;
  } catch {
    // Nothing else to clean up.
  }
}

function getWindowMemory() {
  const host = window as unknown as Record<string, Map<string, string> | undefined>;
  host[WINDOW_MEMORY_KEY] ??= new Map<string, string>();
  return host[WINDOW_MEMORY_KEY];
}

function sessionFromHash(): SessionInfo | null {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    const raw = new URLSearchParams(hash).get("session");
    if (!raw) return null;
    const session = normalizeSession(JSON.parse(raw));
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    return session;
  } catch {
    return null;
  }
}

function normalizeProfile(raw: any): Profile {
  const email = raw?.email ?? "";
  const fullName = raw?.full_name ?? raw?.name ?? raw?.display_name;
  return {
    id: String(raw?.id ?? raw?.user_id ?? email),
    email,
    full_name: fullName,
    display_name: raw?.display_name ?? fullName ?? email.split("@")[0],
    avatar_url: raw?.avatar_url,
  };
}

function normalizeSession(raw: any): SessionInfo {
  const payload = raw?.data ?? raw;
  const expiresIn = Number(payload?.expires_in ?? 3600);
  const expiresAt = payload?.expires_at ?? Math.floor(Date.now() / 1000) + expiresIn;

  return {
    access_token: payload?.token ?? payload?.access_token,
    refresh_token: payload?.refresh_token,
    expires_at: expiresAt,
    user: normalizeProfile(payload?.user),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return requestAt<T>(endpoint(path), path, init);
}

async function requestAt<T>(url: string, label: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed with ${res.status} at ${label}`;
    try {
      const body = await res.json();
      const detail = body?.detail ?? body?.message ?? body?.error;
      message = detail ? `${detail} (${label})` : message;
    } catch {
      const text = await res.text().catch(() => "");
      if (text) message = `${text} (${label})`;
    }
    throw new ApiRequestError(message, res.status, label);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function getCurrentProfile(): Promise<Profile> {
  try {
    return normalizeProfile(await request("/api/auth/me"));
  } catch (err) {
    if (!shouldUseDirectFallback(err)) throw err;
    return normalizeProfile(
      await requestAt(`${DIRECT_BACKEND_BASE}/auth/me`, "/auth/me direct backend fallback"),
    );
  }
}

async function refreshSession(): Promise<SessionInfo | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    let raw: unknown;
    const init = {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    };

    try {
      raw = await request("/api/auth/refresh", init);
    } catch (err) {
      if (!shouldUseDirectFallback(err)) throw err;
      raw = await requestAt(
        `${DIRECT_BACKEND_BASE}/auth/refresh`,
        "/auth/refresh direct backend fallback",
        init,
      );
    }

    const session = normalizeSession(raw);
    saveSession(session, { emit: false });
    return session;
  } catch {
    clearSession();
    return null;
  }
}

async function loginWithBackend(email: string, password: string): Promise<unknown> {
  const body = JSON.stringify({ email, password });
  const init = {
    method: "POST",
    body,
  };

  try {
    return await request("/api/auth/login", init);
  } catch (err) {
    if (!shouldUseDirectFallback(err)) throw err;
    return requestAt(
      `${DIRECT_BACKEND_BASE}/auth/login`,
      "/auth/login direct backend fallback",
      init,
    );
  }
}

async function signupWithBackend(
  email: string,
  password: string,
  fullName?: string,
): Promise<unknown> {
  const init = {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: fullName }),
  };

  try {
    return await request("/api/auth/signup", init);
  } catch (err) {
    if (!shouldUseDirectFallback(err)) throw err;
    return requestAt(
      `${DIRECT_BACKEND_BASE}/auth/signup`,
      "/auth/signup direct backend fallback",
      init,
    );
  }
}

async function logoutWithBackend(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } catch (err) {
    if (!shouldUseDirectFallback(err)) throw err;
    await requestAt(`${DIRECT_BACKEND_BASE}/auth/logout`, "/auth/logout direct backend fallback", {
      method: "POST",
    });
  }
}

async function forgotPasswordWithBackend(email: string): Promise<void> {
  const init = {
    method: "POST",
    body: JSON.stringify({ email }),
  };

  try {
    await request("/api/auth/forgot-password", init);
  } catch (err) {
    if (!shouldUseDirectFallback(err)) throw err;
    await requestAt(
      `${DIRECT_BACKEND_BASE}/auth/forgot-password`,
      "/auth/forgot-password direct backend fallback",
      init,
    );
  }
}

async function resetPasswordWithBackend(token: string, password: string): Promise<void> {
  const init = {
    method: "POST",
    body: JSON.stringify({ token, new_password: password }),
  };

  try {
    await request("/api/auth/reset-password", init);
  } catch (err) {
    if (!shouldUseDirectFallback(err)) throw err;
    await requestAt(
      `${DIRECT_BACKEND_BASE}/auth/reset-password`,
      "/auth/reset-password direct backend fallback",
      init,
    );
  }
}

async function getProfileSession(token: string, expiresAt?: number): Promise<SessionInfo> {
  const profile = await getCurrentProfile();
  const session = {
    access_token: token,
    refresh_token: getRefreshToken() ?? undefined,
    expires_at: expiresAt,
    user: profile,
  };
  saveSession(session, { emit: false });
  return session;
}

function getCachedSession(token: string, expiresAt?: number): SessionInfo | null {
  const cachedUser = getCachedUser();
  if (!cachedUser) return null;
  return {
    access_token: token,
    refresh_token: getRefreshToken() ?? undefined,
    expires_at: expiresAt,
    user: cachedUser,
  };
}

async function refreshOrCachedSession(
  token: string,
  expiresAt?: number,
): Promise<SessionInfo | null> {
  const refreshed = await refreshSession();
  if (refreshed) return refreshed;
  return getCachedSession(token, expiresAt);
}

function resetTokenFromLocation() {
  const url = new URL(window.location.href);
  return (
    url.searchParams.get("token") ??
    url.searchParams.get("access_token") ??
    new URLSearchParams(url.hash.replace(/^#/, "")).get("access_token") ??
    new URLSearchParams(url.hash.replace(/^#/, "")).get("token")
  );
}

export const authApi = {
  eventName: AUTH_EVENT,
  getToken: getAccessToken,
  getCachedUser,

  async login(email: string, password: string): Promise<SessionInfo> {
    const session = normalizeSession(await loginWithBackend(email, password));
    saveSession(session, { emit: false });
    return session;
  },

  async signup(email: string, password: string, fullName?: string): Promise<SessionInfo> {
    const session = normalizeSession(await signupWithBackend(email, password, fullName));
    saveSession(session, { emit: false });
    return session;
  },

  async logout(): Promise<void> {
    try {
      await logoutWithBackend();
    } catch {
      // Local logout must still succeed if the server is already unavailable.
    } finally {
      clearSession();
    }
  },

  async forgotPassword(email: string): Promise<void> {
    await forgotPasswordWithBackend(email);
  },

  async resetPassword(password: string): Promise<void> {
    const token = resetTokenFromLocation();
    if (!token) {
      throw new Error("Missing password reset token. Open the reset link from your email.");
    }
    await resetPasswordWithBackend(token, password);
  },

  async getSession(): Promise<SessionInfo | null> {
    const hashSession = sessionFromHash();
    if (hashSession) {
      saveSession(hashSession, { emit: false });
      return hashSession;
    }

    const token = getAccessToken();
    if (!token) return null;

    const expiresAt = getExpiresAt();
    try {
      return await getProfileSession(token, expiresAt);
    } catch (err) {
      if (err instanceof ApiRequestError && ![401, 403].includes(err.status)) {
        return getCachedSession(token, expiresAt);
      }
      const recovered = await refreshOrCachedSession(token, expiresAt);
      if (recovered) return recovered;
      clearSession();
      return null;
    }
  },
};
