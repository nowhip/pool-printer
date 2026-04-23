import { NextResponse } from "next/server";
import { createPublicLaunchGrant, createPublicLaunchToken } from "@/lib/public-launch";
import { normalizePublicUserId } from "@/lib/public-user";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUsername = typeof body?.username === "string" ? body.username : "";
    const normalizedUser = normalizePublicUserId(rawUsername);

    if (!normalizedUser) {
      return NextResponse.json({ error: "username is required" }, { status: 400 });
    }

    // Ensure launch secret is configured before issuing any signed values.
    if (!process.env.PUBLIC_LAUNCH_SECRET?.trim()) {
      return NextResponse.json(
        { error: "PUBLIC_LAUNCH_SECRET is not configured" },
        { status: 500 },
      );
    }

    const requestUrl = new URL(request.url);
    const baseOrigin = `${requestUrl.protocol}//${requestUrl.host}`;

    const configuredPublicUrl = process.env.PUBLIC_LAUNCH_BROWSER_URL?.trim() || "/public";
    const publicUrl = configuredPublicUrl.startsWith("http")
      ? configuredPublicUrl
      : new URL(configuredPublicUrl, baseOrigin).toString();

    const launchToken = createPublicLaunchToken(normalizedUser);
    const launchGrant = createPublicLaunchGrant(launchToken);
    const activateUrl = new URL("/api/public/activate", baseOrigin);
    activateUrl.searchParams.set("grant", launchGrant);
    activateUrl.searchParams.set("next", publicUrl);

    return NextResponse.json({
      ok: true,
      launchUrl: activateUrl.toString(),
      user: normalizedUser,
      publicUrl,
    });
  } catch (error) {
    console.error("Failed to create public launch token:", error);
    return NextResponse.json({ error: "Failed to create launch token" }, { status: 500 });
  }
}
