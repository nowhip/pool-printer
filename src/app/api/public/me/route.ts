import { NextResponse } from "next/server";
import getDb from "@/lib/db";
import { resolveWindowsUserIdFromHeaders } from "@/lib/windows-user";

export async function GET(request: Request) {
  try {
    const userId = resolveWindowsUserIdFromHeaders(request.headers);

    if (!userId) {
      return NextResponse.json(
        {
          resolved: false,
          error: "Windows username could not be resolved from request headers",
        },
        { status: 400 },
      );
    }

    const db = getDb();
    const user = db
      .prepare("SELECT userId, balance, is_free_account FROM users WHERE userId = ?")
      .get(userId) as
      | { userId: string; balance: number; is_free_account: number }
      | undefined;

    if (!user) {
      return NextResponse.json({
        resolved: true,
        exists: false,
        userId,
      });
    }

    return NextResponse.json({
      resolved: true,
      exists: true,
      userId: user.userId,
      balance: user.balance,
      is_free_account: user.is_free_account,
    });
  } catch (error) {
    console.error("Failed to fetch public account summary:", error);
    return NextResponse.json(
      { error: "Failed to fetch public account summary" },
      { status: 500 },
    );
  }
}
