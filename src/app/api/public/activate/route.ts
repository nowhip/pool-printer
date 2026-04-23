import { NextResponse } from "next/server";
import {
  consumePublicLaunchGrant,
  getPublicLaunchCookieMaxAge,
  PUBLIC_LAUNCH_COOKIE_NAME,
} from "@/lib/public-launch";

function sanitizeRedirectTarget(raw: string | null, origin: string): string {
  const fallback = new URL("/public", origin).toString();

  if (!raw) {
    return fallback;
  }

  try {
    const target = new URL(raw, origin);
    if (target.origin !== new URL(origin).origin) {
      return fallback;
    }
    return target.toString();
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const origin = process.env.NEXTAUTH_URL?.trim();
  if (!origin) {
    return new NextResponse("NEXTAUTH_URL is not configured", { status: 500 });
  }

  const reqUrl = new URL(request.url);
  const grant = reqUrl.searchParams.get("grant")?.trim() || "";
  const next = sanitizeRedirectTarget(reqUrl.searchParams.get("next"), origin);

  if (!grant) {
    return new NextResponse("Invalid launch request", { status: 400 });
  }

  const consumed = consumePublicLaunchGrant(grant);
  if (!consumed.valid || !consumed.launchToken) {
    return new NextResponse("Launch token is invalid or expired. Please start again via launcher.", {
      status: 403,
    });
  }

  const response = NextResponse.redirect(next);
  response.cookies.set(PUBLIC_LAUNCH_COOKIE_NAME, consumed.launchToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: getPublicLaunchCookieMaxAge(),
  });

  return response;
}