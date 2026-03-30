import { NextResponse } from "next/server";
import { resolveWindowsUserIdFromHeaders } from "@/lib/public-user";

export async function GET(request: Request) {
  const resolvedUser = resolveWindowsUserIdFromHeaders(request.headers);

  if (!resolvedUser.userId) {
    console.warn("[API][USER] Windows username header missing");
    return NextResponse.json(
      {
        user: "",
        error: "Windows username header not found",
      },
      { status: 401 },
    );
  }

  return NextResponse.json({ user: resolvedUser.userId });
}
