import "server-only";

const USERNAME_HEADERS = [
  "x-remote-user",
  "x-forwarded-user",
  "remote_user",
  "x-authenticated-user",
  "x-ms-client-principal-name",
  "x-windows-user",
] as const;

export interface ResolvedWindowsUser {
  userId: string;
  source: string;
}

function normalizeUserId(rawValue: string): string {
  const value = rawValue.trim().replace(/^"+|"+$/g, "");
  if (!value) return "";

  const withoutDomainSlash = value.includes("\\")
    ? value.split("\\").pop() || ""
    : value;

  const withoutDomainAt = withoutDomainSlash.includes("@")
    ? withoutDomainSlash.split("@")[0]
    : withoutDomainSlash;

  return withoutDomainAt.trim().toLowerCase();
}

export function resolveWindowsUser(headers: Headers): ResolvedWindowsUser | null {
  for (const headerName of USERNAME_HEADERS) {
    const headerValue = headers.get(headerName);
    if (!headerValue) continue;

    const normalized = normalizeUserId(headerValue);
    if (normalized) {
      return { userId: normalized, source: `header:${headerName}` };
    }
  }

  return null;
}

export function resolveWindowsUserIdFromHeaders(headers: Headers): string | null {
  return resolveWindowsUser(headers)?.userId ?? null;
}
