import { PUBLIC_LAUNCH_COOKIE_NAME, verifyPublicLaunchToken } from "@/lib/public-launch";

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
  const cookieHeader = request.headers.get("cookie") || "";
  const rawToken = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PUBLIC_LAUNCH_COOKIE_NAME}=`))
    ?.slice(PUBLIC_LAUNCH_COOKIE_NAME.length + 1);

  if (!rawToken) {
    return {
      userId: null,
      source: null,
      rawValue: null,
    };
  }

  const tokenResult = verifyPublicLaunchToken(rawToken);
  if (!tokenResult.valid || !tokenResult.userId) {
    return {
      userId: null,
      source: null,
      rawValue: rawToken,
    };
  }

  const userId = normalizePublicUserId(tokenResult.userId);
  if (userId) {
    return { userId, source: "launchCookie", rawValue: rawToken };
  }

  return {
    userId: null,
    source: null,
    rawValue: null,
  };
}
