import { NextResponse } from "next/server";
import getDb from "@/lib/db";
import { resolvePublicUserIdFromRequest } from "@/lib/public-user";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolvedUser = resolvePublicUserIdFromRequest(request);
    const userId = resolvedUser.userId;
    const action = body?.action === "restore" ? "restore" : "request";

    if (!userId) {
      return NextResponse.json({
        error: "Public user is missing",
        hint: "Start the app via the PowerShell launcher so the current Windows username is appended as ?user=...",
      });
    }

    const db = getDb();

    const user = db
      .prepare(
        "SELECT userId, account_state, deletion_expires_at FROM users WHERE userId = ?",
      )
      .get(userId) as
      | {
          userId: string;
          account_state: string;
          deletion_expires_at: string | null;
        }
      | undefined;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (action === "restore") {
      if (user.account_state !== "deletion_requested") {
        return NextResponse.json({ error: "User is not pending deletion" }, { status: 400 });
      }

      db.prepare(
        `UPDATE users
         SET account_state = 'active',
             deletion_requested_at = NULL,
             deletion_expires_at = NULL,
             deletion_requested_by = NULL
         WHERE userId = ?`,
      ).run(userId);

      return NextResponse.json({ success: true, restored: true });
    }

    if (user.account_state === "deletion_requested") {
      return NextResponse.json({
        success: true,
        alreadyRequested: true,
        deletion_expires_at: user.deletion_expires_at,
      });
    }

    db.prepare(
      `UPDATE users
       SET account_state = 'deletion_requested',
           deletion_requested_at = datetime('now', 'localtime'),
           deletion_expires_at = datetime('now', 'localtime', '+7 days'),
           deletion_requested_by = 'self'
       WHERE userId = ?`,
    ).run(userId);

    const updated = db
      .prepare("SELECT deletion_expires_at FROM users WHERE userId = ?")
      .get(userId) as { deletion_expires_at: string | null };

    return NextResponse.json({
      success: true,
      requested: true,
      deletion_expires_at: updated.deletion_expires_at,
    });
  } catch (error) {
    console.error("Failed to process public account deletion action:", error);
    return NextResponse.json(
      { error: "Failed to process public account deletion action" },
      { status: 500 },
    );
  }
}
