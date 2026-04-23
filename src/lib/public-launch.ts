import crypto from "crypto";

type LaunchPayload = {
  t: "access";
  u: string;
  exp: number;
};

type GrantPayload = {
  t: "grant";
  tok: string;
  exp: number;
};

export const PUBLIC_LAUNCH_COOKIE_NAME = "pool_printer_public_launch";

function getLaunchSecret(): string {
  const secret = process.env.PUBLIC_LAUNCH_SECRET?.trim();
  if (!secret) {
    throw new Error("PUBLIC_LAUNCH_SECRET is not configured");
  }
  return secret;
}

function getLaunchTtlSeconds(): number {
  const raw = process.env.PUBLIC_LAUNCH_TTL_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : 120;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 120;
  }
  return parsed;
}

function getLaunchGrantTtlSeconds(): number {
  const raw = process.env.PUBLIC_LAUNCH_GRANT_TTL_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : 30;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 30;
  }
  return parsed;
}

function signPayload(encodedPayload: string): string {
  const secret = getLaunchSecret();
  return crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");
}

export function createPublicLaunchToken(userId: string): string {
  const payload: LaunchPayload = {
    t: "access",
    u: userId,
    exp: Math.floor(Date.now() / 1000) + getLaunchTtlSeconds(),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function getPublicLaunchCookieMaxAge(): number {
  return getLaunchTtlSeconds();
}

export function createPublicLaunchGrant(launchToken: string): string {
  const payload: GrantPayload = {
    t: "grant",
    tok: launchToken,
    exp: Math.floor(Date.now() / 1000) + getLaunchGrantTtlSeconds(),
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifySignedPayload(token: string): { valid: boolean; payload: LaunchPayload | GrantPayload | null; reason?: string } {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, payload: null, reason: "invalid_format" };
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    return { valid: false, payload: null, reason: "invalid_format" };
  }

  const expectedSignature = signPayload(encodedPayload);
  const providedBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);

  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return { valid: false, payload: null, reason: "bad_signature" };
  }

  let payload: LaunchPayload | GrantPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as LaunchPayload | GrantPayload;
  } catch {
    return { valid: false, payload: null, reason: "bad_payload" };
  }

  if (!payload?.exp || typeof payload.exp !== "number") {
    return { valid: false, payload: null, reason: "missing_exp" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return { valid: false, payload: null, reason: "expired" };
  }

  return { valid: true, payload };
}

export function verifyPublicLaunchToken(token: string): {
  valid: boolean;
  userId: string | null;
  reason?: string;
} {
  const verified = verifySignedPayload(token);
  if (!verified.valid || !verified.payload) {
    return { valid: false, userId: null, reason: verified.reason || "invalid" };
  }

  const payload = verified.payload;

  if (payload.t !== "access") {
    return { valid: false, userId: null, reason: "wrong_type" };
  }

  if (!payload?.u || typeof payload.u !== "string") {
    return { valid: false, userId: null, reason: "missing_user" };
  }

  return { valid: true, userId: payload.u };
}

export function consumePublicLaunchGrant(grant: string): {
  valid: boolean;
  launchToken: string | null;
  reason?: string;
} {
  const verified = verifySignedPayload(grant);
  if (!verified.valid || !verified.payload) {
    return { valid: false, launchToken: null, reason: verified.reason || "invalid" };
  }

  const payload = verified.payload;
  if (payload.t !== "grant") {
    return { valid: false, launchToken: null, reason: "wrong_type" };
  }

  if (!payload.tok || typeof payload.tok !== "string") {
    return { valid: false, launchToken: null, reason: "missing_token" };
  }

  return { valid: true, launchToken: payload.tok };
}
