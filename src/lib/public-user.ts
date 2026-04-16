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

export function resolvePublicUserIdFromRequest(request: Request): {
  userId: string | null;
  source: string | null;
  rawValue: string | null;
} {
  const url = new URL(request.url);
  const queryCandidates = ["user", "userId", "username"] as const;

  for (const queryName of queryCandidates) {
    const rawValue = url.searchParams.get(queryName);
    const userId = normalizePublicUserId(rawValue);
    if (userId) {
      return { userId, source: queryName, rawValue };
    }
  }

  return {
    userId: null,
    source: null,
    rawValue: null,
  };
}
