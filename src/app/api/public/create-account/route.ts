import { NextResponse } from "next/server";
import getDb from "@/lib/db";
import { resolvePublicUserIdFromRequest } from "@/lib/public-user";

export async function POST(request: Request) {
  try {
    const resolvedUser = resolvePublicUserIdFromRequest(request);
    const userId = resolvedUser.userId;

    if (!userId) {
      return NextResponse.json({
        error: "Public launch cookie missing",
        hint: "Start this page via the launcher executable or PowerShell script.",
      });
    }

    const db = getDb();

    const existingUser = db
      .prepare(
        "SELECT userId, balance, is_free_account, account_state FROM users WHERE userId = ?",
      )
      .get(userId) as
      | { userId: string; balance: number; is_free_account: number; account_state: string }
      | undefined;

    if (existingUser) {
      if (existingUser.account_state === "deletion_requested") {
        db.prepare(
          `UPDATE users
           SET account_state = 'active',
               deletion_requested_at = NULL,
               deletion_expires_at = NULL,
               deletion_requested_by = NULL
           WHERE userId = ?`,
        ).run(userId);

        return NextResponse.json({
          created: false,
          restored: true,
          userId: existingUser.userId,
          balance: existingUser.balance,
          is_free_account: existingUser.is_free_account,
        });
      }

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
