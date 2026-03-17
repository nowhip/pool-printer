const USERNAME_HEADERS = [
  "x-remote-user",
  "x-forwarded-user",
  "remote_user",
  "x-authenticated-user",
  "x-ms-client-principal-name",
  "x-windows-user",
] as const;

function normalizeUserId(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveWindowsUserIdFromHeaders(headers: Headers): string | null {
  for (const headerName of USERNAME_HEADERS) {
    const headerValue = headers.get(headerName);
    if (!headerValue) continue;

    const normalized = normalizeUserId(headerValue);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}
