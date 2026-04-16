import { NextResponse } from "next/server";
import { resolveWindowsUserIdFromHeaders } from "@/lib/public-user";

export async function GET(request: Request) {
  const resolvedUser = resolveWindowsUserIdFromHeaders(request.headers);

  // Log for debugging
  console.log("[API][USER] Debug info:", {
    foundUser: !!resolvedUser.userId,
    source: resolvedUser.source,
    rawValue: resolvedUser.rawValue,
    allHeaders: Object.fromEntries(request.headers),
  });

  if (!resolvedUser.userId) {
    console.warn("[API][USER] Windows username header missing - checking raw headers:");
    const headersList: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headersList[key] = value;
    });
    console.warn("[API][USER] Raw headers:", headersList);

    return NextResponse.json(
      {
        user: "",
        error: "Windows username header not found",
        debug: {
          message: "No authentication header found. Check /api/debug/headers",
          attemptedHeaders: [
            "x-user",
            "remote_user",
            "remote-user",
            "x-remote-user",
            "x-forwarded-user",
            "x-authenticated-user",
          ],
        },
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ user: resolvedUser.userId });
}

