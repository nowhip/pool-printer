import { NextResponse } from "next/server";
import getDb from "@/lib/db";
import { resolveWindowsUserIdFromHeaders } from "@/lib/windows-user";

export async function POST(request: Request) {
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

    const existingUser = db
      .prepare("SELECT userId, balance, is_free_account FROM users WHERE userId = ?")
      .get(userId) as
      | { userId: string; balance: number; is_free_account: number }
      | undefined;

    if (existingUser) {
      return NextResponse.json({
        created: false,
        userId: existingUser.userId,
        balance: existingUser.balance,
        is_free_account: existingUser.is_free_account,
      });
    }

    db.prepare("INSERT INTO users (userId, balance, is_free_account) VALUES (?, 0, 0)").run(userId);

    return NextResponse.json(
      {
        created: true,
        userId,
        balance: 0,
        is_free_account: 0,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create public account:", error);
    return NextResponse.json(
      { error: "Failed to create public account" },
      { status: 500 },
    );
  }
}
