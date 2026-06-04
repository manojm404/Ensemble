const AUTH_TOKEN_KEY = "ensemble_auth_token";

export function getAuthScopeSuffix(): string {
  if (typeof window === "undefined") return "anonymous";
  const token = localStorage.getItem(AUTH_TOKEN_KEY) || "";
  if (!token) return "anonymous";
  return token.slice(0, 16);
}

export function scopedStorageKey(baseKey: string): string {
  return `${baseKey}__${getAuthScopeSuffix()}`;
}
