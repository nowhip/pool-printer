import "server-only";
import os from "node:os";

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

function isLocalRequest(headers: Headers): boolean {
  const host = (headers.get("x-forwarded-host") || headers.get("host") || "").toLowerCase();
  const forwardedFor = (headers.get("x-forwarded-for") || "").toLowerCase();
  const realIp = (headers.get("x-real-ip") || "").toLowerCase();

  const hostLooksLocal =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]");

  const ipLooksLocal =
    !forwardedFor ||
    forwardedFor.includes("127.0.0.1") ||
    forwardedFor.includes("::1") ||
    realIp === "127.0.0.1" ||
    realIp === "::1";

  return hostLooksLocal && ipLooksLocal;
}

export function resolveWindowsUser(headers: Headers): ResolvedWindowsUser | null {
  const customHeaderName = process.env.WINDOWS_USER_HEADER?.trim().toLowerCase();
  if (customHeaderName) {
    const customHeaderValue = headers.get(customHeaderName);
    const normalized = customHeaderValue ? normalizeUserId(customHeaderValue) : "";
    if (normalized) {
      return { userId: normalized, source: `header:${customHeaderName}` };
    }
  }

  for (const headerName of USERNAME_HEADERS) {
    const headerValue = headers.get(headerName);
    if (!headerValue) continue;

    const normalized = normalizeUserId(headerValue);
    if (normalized) {
      return { userId: normalized, source: `header:${headerName}` };
    }
  }

  if (isLocalRequest(headers)) {
    const envUser = normalizeUserId(process.env.USERNAME || process.env.USER || "");
    if (envUser) {
      return { userId: envUser, source: "server-env" };
    }

    try {
      const osUser = normalizeUserId(os.userInfo().username);
      if (osUser) {
        return { userId: osUser, source: "os.userInfo" };
      }
    } catch {
      // ignore fallback errors
    }
  }

  return null;
}

export function resolveWindowsUserIdFromHeaders(headers: Headers): string | null {
  return resolveWindowsUser(headers)?.userId ?? null;
}
