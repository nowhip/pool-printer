import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const headersList: Record<string, string> = {};

  // Capture all headers
  request.headers.forEach((value, key) => {
    headersList[key] = value;
  });

  return NextResponse.json({
    message: "All incoming headers from IIS/proxy",
    headers: headersList,
    timestamp: new Date().toISOString(),
  });
}
