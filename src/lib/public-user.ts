const USER_HEADER_CANDIDATES = [
  "x-user",
  "remote_user",
  "remote-user",
  "x-remote-user",
  "x-forwarded-user",
  "x-authenticated-user",
] as const;

export function normalizePublicUserId(rawValue: unknown): string | null {
  if (typeof rawValue !== "string") return null;

  const trimmed = rawValue.trim().replace(/^"+|"+$/g, "");
  if (!trimmed) return null;

  const withoutDomainSlash = trimmed.includes("\\")
    ? trimmed.split("\\").pop() || ""
    : trimmed;

  const withoutDomainAt = withoutDomainSlash.includes("@")
    ? withoutDomainSlash.split("@")[0] || ""
    : withoutDomainSlash;

  const normalized = withoutDomainAt.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function resolveWindowsUserIdFromHeaders(headers: Headers): {
  userId: string | null;
  source: string | null;
  rawValue: string | null;
} {
  for (const headerName of USER_HEADER_CANDIDATES) {
    const rawValue = headers.get(headerName);
    const userId = normalizePublicUserId(rawValue);
    if (userId) {
      return { userId, source: headerName, rawValue };
    }
  }

  return {
    userId: null,
    source: null,
    rawValue: null,
  };
}
