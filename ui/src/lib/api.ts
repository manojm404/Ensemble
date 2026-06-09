/**
 * 0101 API client. Talks to the FastAPI backend at VITE_API_BASE_URL.
 * - JWT bearer attached automatically
 * - Auto-refresh on 401 via /auth/refresh
 * - Falls back to demo fixtures when no backend is configured
 */

import { getDemoResponse } from "./demo";

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
export const DEMO_MODE = !BASE;

type Tokens = { access: string; refresh?: string };
const TOKEN_KEY = "0101.tokens";

function loadTokens(): Tokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}
export function saveTokens(tokens: Tokens | null) {
  if (typeof window === "undefined") return;
  if (!tokens) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  window.dispatchEvent(new CustomEvent("0101:auth"));
}
export function getAccessToken(): string | null {
  return loadTokens()?.access ?? null;
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function refreshAccess(): Promise<boolean> {
  const tokens = loadTokens();
  if (!tokens?.refresh) return false;
  try {
    const r = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: tokens.refresh }),
    });
    if (!r.ok) return false;
    const data = (await r.json()) as { access_token?: string; refresh_token?: string };
    if (!data.access_token) return false;
    saveTokens({ access: data.access_token, refresh: data.refresh_token ?? tokens.refresh });
    return true;
  } catch {
    return false;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip auth header (used by login/signup). */
  anonymous?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  if (DEMO_MODE) {
    const demo = getDemoResponse(path);
    if (demo !== undefined) {
      await new Promise((r) => setTimeout(r, 80));
      return demo as T;
    }
    // Demo login / signup / logout — succeed silently
    if (path === "/auth/login" || path === "/auth/signup") {
      await new Promise((r) => setTimeout(r, 200));
      return {
        access_token: "demo.access",
        refresh_token: "demo.refresh",
        user: getDemoResponse("/auth/me"),
      } as T;
    }
    if (
      path === "/auth/logout" ||
      path === "/auth/refresh" ||
      path.startsWith("/auth/forgot") ||
      path.startsWith("/auth/reset")
    ) {
      return {} as T;
    }
  }
  const url = new URL(
    path.startsWith("http") ? path : `${BASE || ""}${path}`,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.headers ?? {}),
    };
    if (opts.body !== undefined && !(opts.body instanceof FormData)) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }
    if (!opts.anonymous) {
      const tok = getAccessToken();
      if (tok) headers.Authorization = `Bearer ${tok}`;
    }
    return fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers,
      body:
        opts.body === undefined
          ? undefined
          : opts.body instanceof FormData
            ? opts.body
            : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  };

  let res = await doFetch();
  if (res.status === 401 && !opts.anonymous) {
    const ok = await refreshAccess();
    if (ok) res = await doFetch();
  }

  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* ignore */
    }
    const msg =
      (typeof data === "object" &&
      data &&
      "detail" in data &&
      typeof (data as { detail: unknown }).detail === "string"
        ? (data as { detail: string }).detail
        : null) ?? `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, msg, data);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

/** Whether the client has been configured with a backend URL. */
export const apiConfigured = Boolean(BASE);
