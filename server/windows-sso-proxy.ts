import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sso } = require("node-expose-sspi") as {
  sso: {
    auth: () => (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void;
  };
};

interface SsoRequest extends IncomingMessage {
  sso?: {
    user?: {
      domain?: string;
      name?: string;
    };
  };
}

const proxyPort = parseInt(process.env.SSO_PROXY_PORT || "3000", 10);
const nextPort = parseInt(process.env.NEXT_INTERNAL_PORT || "3100", 10);
const nextHost = process.env.NEXT_INTERNAL_HOST || "127.0.0.1";
const userHeader = "x-remote-user";
const skipNextLaunch = process.env.SSO_PROXY_SKIP_NEXT === "1";
const lanOnly = process.env.LAN_ONLY !== "0";

if (!process.env.NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = `http://localhost:${proxyPort}`;
}

function normalizeUserId(rawValue: string): string {
  const value = rawValue.trim().replace(/^"+|"+$/g, "");
  if (!value) return "";

  const withoutDomainSlash = value.includes("\\")
    ? value.split("\\").pop() || ""
    : value;

  const withoutDomainAt = withoutDomainSlash.includes("@")
    ? withoutDomainSlash.split("@")[0]
    : withoutDomainSlash;

  return withoutDomainAt.trim().toLowerCase();
}

function getWindowsUser(req: SsoRequest): string | null {
  const domain = req.sso?.user?.domain?.trim();
  const name = req.sso?.user?.name?.trim();
  const rawUser = domain ? `${domain}\\${name || ""}` : name || "";
  const normalized = normalizeUserId(rawUser);
  return normalized || null;
}

function isAllowedClientAddress(remoteAddress?: string | null): boolean {
  if (!remoteAddress) return false;

  const normalized = remoteAddress.replace(/^::ffff:/, "").toLowerCase();

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

function sendBadGateway(res: ServerResponse, message: string) {
  res.statusCode = 502;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: message }));
}

function proxyToNext(req: SsoRequest, res: ServerResponse) {
  const windowsUser = getWindowsUser(req);

  const upstreamHeaders: Record<string, string | string[] | undefined> = {
    ...req.headers,
  };

  upstreamHeaders.host = `${nextHost}:${nextPort}`;

  if (windowsUser) {
    upstreamHeaders[userHeader] = windowsUser;
  }

  const upstreamReq = httpRequest(
    {
      host: nextHost,
      port: nextPort,
      method: req.method,
      path: req.url,
      headers: upstreamHeaders,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );

  upstreamReq.on("error", (error) => {
    console.error("[SSO PROXY] Failed to reach Next.js upstream:", error);
    if (!res.headersSent) {
      sendBadGateway(res, "Upstream Next.js server unavailable");
    } else {
      res.end();
    }
  });

  req.pipe(upstreamReq);
}

function startNextProcess(): ChildProcess {
  const nextBin = require.resolve("next/dist/bin/next");
  const nextArgs = [nextBin, "start", "-H", nextHost, "-p", String(nextPort)];

  const child = spawn(process.execPath, nextArgs, {
    env: process.env,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    console.log(`[SSO PROXY] Next.js process exited (code=${code}, signal=${signal}).`);
  });

  return child;
}

const ssoAuth = sso.auth();

let nextProcess: ChildProcess | null = null;
if (!skipNextLaunch) {
  nextProcess = startNextProcess();
}

const server = createServer((req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  if (req.url === "/healthz") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("ok");
    return;
  }

  if (lanOnly) {
    const clientAddress = req.socket.remoteAddress;
    if (!isAllowedClientAddress(clientAddress)) {
      res.statusCode = 403;
      res.end("Forbidden");
      return;
    }
  }

  ssoAuth(req, res, (error?: unknown) => {
    if (error) {
      console.error("[SSO PROXY] SSO auth callback error:", error);
      if (!res.headersSent) {
        res.statusCode = 401;
        res.end("Unauthorized");
      }
      return;
    }

    proxyToNext(req as SsoRequest, res);
  });
});

server.listen(proxyPort, () => {
  console.log("[SSO PROXY] Windows SSO proxy is running.");
  console.log(`[SSO PROXY] Public URL: http://localhost:${proxyPort}`);
  console.log(`[SSO PROXY] Forwarding to Next.js at http://${nextHost}:${nextPort}`);
  console.log(`[SSO PROXY] Forwarded user header: ${userHeader}`);
  console.log(`[SSO PROXY] Access policy: ${lanOnly ? "loopback + private LAN only" : "unrestricted"}.`);
  if (skipNextLaunch) {
    console.log("[SSO PROXY] Next.js auto-launch is disabled (SSO_PROXY_SKIP_NEXT=1).");
  }
});

function shutdown(signal: NodeJS.Signals) {
  console.log(`\n[SSO PROXY] Received ${signal}. Shutting down...`);

  server.close(() => {
    console.log("[SSO PROXY] HTTP server stopped.");
  });

  if (nextProcess && !nextProcess.killed) {
    nextProcess.kill("SIGINT");
  }

  setTimeout(() => {
    process.exit(0);
  }, 500);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
