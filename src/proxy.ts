import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_LAUNCH_COOKIE_NAME = "pool_printer_public_launch";

const LAN_ONLY = process.env.LAN_ONLY !== "0";

function isPrivateOrLoopbackIp(ip: string): boolean {
  const normalized = ip.replace(/^::ffff:/, "").toLowerCase();

  if (normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("10.")) {
    return true;
  }

  if (normalized.startsWith("192.168.")) {
    return true;
  }

  if (normalized.startsWith("172.")) {
    const secondOctet = Number.parseInt(normalized.split(".")[1] || "0", 10);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:")) {
    return true;
  }

  return false;
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "127.0.0.1";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLaunchCookie = !!request.cookies.get(PUBLIC_LAUNCH_COOKIE_NAME)?.value;

  // Public self-service page and APIs (no supervisor login)
  if (pathname === "/public") {
    return NextResponse.next();
  }

  if (pathname === "/api/public/launch") {
    return NextResponse.next();
  }

  if (pathname === "/api/public/activate") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/public")) {
    if (!hasLaunchCookie && pathname !== "/api/public/me") {
      return NextResponse.json(
        {
          error: "Public launch cookie missing",
          hint: "Start this page via the launcher executable/script.",
        },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  // Allow NextAuth API routes
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Protect print middleware API routes with API_KEY
  if (pathname.startsWith("/api/print")) {
    if (LAN_ONLY) {
      const clientIp = getClientIp(request);
      if (!isPrivateOrLoopbackIp(clientIp)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.API_KEY;

    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Root: public for normal users, dashboard for signed-in supervisors
  if (pathname === "/") {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (token) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Allow login page
  if (pathname === "/login") {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (token) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Protect all other routes (pages and API)
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    // API routes return 401
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages redirect to login
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
