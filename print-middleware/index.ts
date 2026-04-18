/**
 * Print Middleware Script (Ubuntu CUPS)
 *
 * Polls CUPS queues, communicates with the Next.js API to reserve/confirm/cancel prints,
 * and manages print job lifecycle with queue-level control.
 *
 * Usage:
 *   npx tsx print-middleware/index.ts
 *
 * Environment variables:
 *   NEXTAUTH_URL   - Next.js API base URL (default: http://localhost:3000)
 *   API_KEY        - API key matching the Next.js backend
 *   POLL_INTERVAL  - Polling interval in ms (default: 3000)
 *   PRINTER_BW     - CUPS B&W queue name (default: PoolDrucker_SW)
 *   PRINTER_COLOR  - CUPS color queue name (optional)
 */

import { exec } from "child_process";
import { promisify } from "util";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "..", ".env.local") });

const execAsync = promisify(exec);

async function runCmd(command: string): Promise<string> {
  const { stdout } = await execAsync(command, { shell: "/bin/bash" });
  return stdout.trim();
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

const API_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error("ERROR: API_KEY environment variable is required.");
  process.exit(1);
}

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "3000", 10);
const PRINTER_BW = process.env.PRINTER_BW || "PoolDrucker_SW";
const PRINTER_COLOR = process.env.PRINTER_COLOR || "";

interface TrackedJob {
  jobId: number;
  transactionId: number | null;
  printerName: string;
  userId: string;
  isFree: boolean;
  resumedAt: number;
}

type PageSource = "sheets" | "job-impressions" | "total-pages-x-copies" | "fallback-1";

interface CupsJob {
  Id: number;
  JobId?: number;
  DocumentName: string;
  UserName: string;
  PrinterName: string;
  TotalPages: number;
  PagesPrinted: number;
  Copies: number;
  JobStatus: string;
  pageSource: PageSource;
}

const trackedJobs = new Map<string, TrackedJob>();

function jobKey(printerName: string, jobId: number): string {
  return `${printerName}:${jobId}`;
}

function normalizeUserId(rawValue: string): string {
  const value = rawValue.trim().replace(/^"+|"+$/g, "");
  if (!value) return "";

  const withoutDomainSlash = value.includes("\\") ? value.split("\\").pop() || "" : value;
  const withoutDomainAt = withoutDomainSlash.includes("@") ? withoutDomainSlash.split("@")[0] : withoutDomainSlash;

  return withoutDomainAt.trim().toLowerCase();
}

function getPrinterType(printerName: string): "bw" | "color" {
  if (PRINTER_COLOR && printerName === PRINTER_COLOR && PRINTER_COLOR !== PRINTER_BW) {
    return "color";
  }
  return "bw";
}

function hasTrackedJobsForPrinter(printerName: string): boolean {
  for (const tracked of trackedJobs.values()) {
    if (tracked.printerName === printerName) return true;
  }
  return false;
}

async function apiRequest(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function extractNumericValue(block: string, keys: string[]): number {
  const lines = block.split("\n");
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!keys.some((k) => lower.startsWith(k))) continue;
    const match = line.match(/(\d+)/);
    if (match) return parseInt(match[1], 10);
  }
  return 0;
}

function extractTextValue(block: string, keys: string[]): string {
  const lines = block.split("\n");
  for (const line of lines) {
    const lower = line.toLowerCase();
    const key = keys.find((k) => lower.startsWith(k));
    if (!key) continue;
    const idx = line.indexOf(":");
    if (idx >= 0) return line.slice(idx + 1).trim();
  }
  return "";
}

function determinePages(totalPages: number, copies: number, sheets: number, jobImpressions: number): { pages: number; pageSource: PageSource } {
  if (sheets > 0) {
    return { pages: sheets, pageSource: "sheets" };
  }
  if (jobImpressions > 0) {
    return { pages: jobImpressions, pageSource: "job-impressions" };
  }
  if (totalPages > 0 && copies > 0) {
    return { pages: totalPages * copies, pageSource: "total-pages-x-copies" };
  }
  return { pages: 1, pageSource: "fallback-1" };
}

function parseLpstatJobs(output: string, printerName: string): CupsJob[] {
  if (!output.trim()) return [];

  const jobs: CupsJob[] = [];
  const lines = output.split("\n");

  let currentHeader = "";
  let currentBlock: string[] = [];

  const flush = () => {
    if (!currentHeader) return;

    const headerMatch = currentHeader.match(new RegExp(`^${printerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-?(\\d+)\\s+(\\S+)`));
    if (!headerMatch) {
      currentHeader = "";
      currentBlock = [];
      return;
    }

    const id = parseInt(headerMatch[1], 10);
    const userName = headerMatch[2] || "unknown";
    const block = currentBlock.join("\n");

    const documentName = extractTextValue(block, ["title", "document name", "job-name"]) || `job-${id}`;
    const copies = Math.max(1, extractNumericValue(block, ["copies"])) || 1;
    const totalPages = Math.max(0, extractNumericValue(block, ["impressions", "job-impressions", "pages"]));
    const sheets = Math.max(0, extractNumericValue(block, ["sheets", "job-media-sheets", "job-media-sheets-completed"]));
    const jobImpressions = Math.max(0, extractNumericValue(block, ["job-impressions-completed", "job-impressions"]));

    const { pages, pageSource } = determinePages(totalPages, copies, sheets, jobImpressions);

    let status = "queued";
    const lowerBlock = block.toLowerCase();
    if (lowerBlock.includes("held") || lowerBlock.includes("stopped") || lowerBlock.includes("paused")) {
      status = "held";
    } else if (lowerBlock.includes("processing") || lowerBlock.includes("printing")) {
      status = "processing";
    }

    jobs.push({
      Id: id,
      JobId: id,
      DocumentName: documentName,
      UserName: userName,
      PrinterName: printerName,
      TotalPages: totalPages,
      PagesPrinted: 0,
      Copies: copies,
      JobStatus: status,
      pageSource,
    });

    currentHeader = "";
    currentBlock = [];
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();
    const isJobHeader = trimmed.startsWith(`${printerName}-`) && /^.+-\d+\s+\S+/.test(trimmed);
    if (isJobHeader) {
      flush();
      currentHeader = trimmed;
      continue;
    }

    if (currentHeader) {
      currentBlock.push(trimmed.trim());
    }
  }

  flush();
  return jobs;
}

async function listJobs(printerName: string, mode: "not-completed" | "completed"): Promise<CupsJob[]> {
  try {
    const p = shellQuote(printerName);
    const output = await runCmd(`lpstat -W ${mode} -l -o ${p} 2>/dev/null || true`);
    return parseLpstatJobs(output, printerName);
  } catch (error) {
    console.error(`[CUPS] Failed to list ${mode} jobs for ${printerName}: ${formatError(error)}`);
    return [];
  }
}

async function getActiveJobs(): Promise<CupsJob[]> {
  const printers = !PRINTER_COLOR || PRINTER_BW === PRINTER_COLOR ? [PRINTER_BW] : [PRINTER_BW, PRINTER_COLOR];
  const allJobs: CupsJob[] = [];

  for (const printer of printers) {
    const jobs = await listJobs(printer, "not-completed");
    allJobs.push(...jobs);
  }

  return allJobs;
}

async function setPrinterPausedState(printerName: string, pause: boolean): Promise<boolean> {
  const p = shellQuote(printerName);
  const commands = pause
    ? [`cupsdisable ${p}`]
    : [`cupsenable ${p}`, `cupsaccept ${p}`];

  let ok = true;
  let lastError = "";

  for (const cmd of commands) {
    try {
      await runCmd(`${cmd} 2>/dev/null || true`);
    } catch (error) {
      ok = false;
      lastError = formatError(error);
    }
  }

  if (!ok) {
    console.error(`[CUPS] Failed to ${pause ? "pause" : "resume"} ${printerName}: ${lastError}`);
  }
  return ok;
}

async function unpausePrinter(printerName: string): Promise<boolean> {
  return setPrinterPausedState(printerName, false);
}

async function pausePrinter(printerName: string): Promise<boolean> {
  return setPrinterPausedState(printerName, true);
}

async function jobExists(printerName: string, jobId: number): Promise<boolean> {
  const jobs = await listJobs(printerName, "not-completed");
  return jobs.some((job) => job.Id === jobId);
}

async function removeJob(printerName: string, jobId: number): Promise<boolean> {
  if (!(await jobExists(printerName, jobId))) return true;

  const commands = [
    `cancel ${shellQuote(`${printerName}-${jobId}`)}`,
    `cancel ${jobId}`,
  ];

  let lastError = "";
  for (const cmd of commands) {
    try {
      await runCmd(`${cmd} 2>/dev/null || true`);
      if (!(await jobExists(printerName, jobId))) return true;
    } catch (error) {
      lastError = formatError(error);
    }
  }

  if (!(await jobExists(printerName, jobId))) return true;

  if (lastError) {
    console.warn(`[CLEANUP] Could not remove job #${jobId} from ${printerName}: ${lastError}`);
  }
  return false;
}

async function cancelJob(printerName: string, jobId: number): Promise<boolean> {
  return removeJob(printerName, jobId);
}

async function getCompletedOutcome(printerName: string, jobId: number): Promise<"completed" | "failed" | "unknown"> {
  const completedJobs = await listJobs(printerName, "completed");
  const completed = completedJobs.find((job) => job.Id === jobId);
  if (!completed) return "unknown";

  const status = completed.JobStatus.toLowerCase();
  if (status.includes("canceled") || status.includes("aborted") || status.includes("error")) {
    return "failed";
  }
  return "completed";
}

async function ensureQueuesPaused(): Promise<void> {
  const printers = !PRINTER_COLOR || PRINTER_BW === PRINTER_COLOR ? [PRINTER_BW] : [PRINTER_BW, PRINTER_COLOR];
  for (const printer of printers) {
    await pausePrinter(printer);
  }
}

async function handleQueuedJobs(): Promise<void> {
  const activeJobs = await getActiveJobs();

  const toEnablePrinters = new Set<string>();

  for (const job of activeJobs) {
    const id = job.Id || job.JobId;
    if (!id) continue;

    const key = jobKey(job.PrinterName, id);
    if (trackedJobs.has(key)) continue;

    const printerType = getPrinterType(job.PrinterName);
    const copies = job.Copies || 1;
    const pages = job.TotalPages > 0 ? job.TotalPages : 1;
    const userId = normalizeUserId(job.UserName || "") || "unknown";

    console.log(
      `[NEW] Job #${id} from ${userId} on ${job.PrinterName} (${job.TotalPages || 1} pages x ${copies} copies = ${pages} total, ${printerType}, source: ${job.pageSource}, status: ${job.JobStatus})`
    );

    try {
      const result = await apiRequest("/api/print/reserve", {
        userId,
        pages,
        printerType,
        jobKey: key,
      });

      if (result.allowed) {
        const tracked: TrackedJob = {
          jobId: id,
          transactionId: (result.transactionId as number) || null,
          printerName: job.PrinterName,
          userId,
          isFree: !!result.isFree,
          resumedAt: Date.now(),
        };

        trackedJobs.set(key, tracked);
        toEnablePrinters.add(job.PrinterName);

        console.log(
          `[RESERVED] Job #${id} - ${result.isFree ? "FREE" : `Transaction #${result.transactionId}${result.deduplicated ? " (deduplicated)" : ""}`}`
        );
      } else {
        console.log(`[DENIED] Job #${id} from ${userId}: ${result.reason}`);
        console.log(`        Balance: ${result.balance || "N/A"}, Required: ${result.required || "N/A"}`);
        const removed = await cancelJob(job.PrinterName, id);
        if (removed) {
          console.log(`[REMOVED] Job #${id} has been deleted from ${job.PrinterName} (user not found or insufficient balance)`);
        } else {
          console.warn(`[PENDING] Job #${id} could not be removed from ${job.PrinterName}; it may still be in queue`);
        }
      }
    } catch (error) {
      console.error(`[ERROR] Failed to process job #${id}:`, error);
    }
  }

  for (const printer of toEnablePrinters) {
    await unpausePrinter(printer);
    console.log(`[CUPS] ${printer} enabled to process approved jobs`);
  }
}

async function checkTrackedJobs(): Promise<void> {
  for (const [key, tracked] of trackedJobs.entries()) {
    try {
      const stillQueued = await jobExists(tracked.printerName, tracked.jobId);

      if (!stillQueued) {
        const outcome = await getCompletedOutcome(tracked.printerName, tracked.jobId);
        if (outcome === "failed") {
          if (tracked.transactionId && !tracked.isFree) {
            await apiRequest("/api/print/cancel", { transactionId: tracked.transactionId });
            console.log(`[CANCELLED] Job #${tracked.jobId} - Marked failed by spooler, refunded`);
          }
        } else {
          if (tracked.transactionId && !tracked.isFree) {
            await apiRequest("/api/print/confirm", { transactionId: tracked.transactionId });
            console.log(`[COMPLETED] Job #${tracked.jobId} - Transaction #${tracked.transactionId} confirmed`);
          } else {
            console.log(`[COMPLETED] Job #${tracked.jobId} (free account)`);
          }
        }

        trackedJobs.delete(key);
        if (!hasTrackedJobsForPrinter(tracked.printerName)) {
          await pausePrinter(tracked.printerName);
          console.log(`[CUPS] ${tracked.printerName} paused (no tracked jobs)`);
        }
        continue;
      }

      const elapsed = Date.now() - tracked.resumedAt;
      if (elapsed > 5 * 60 * 1000) {
        console.log(`[TIMEOUT] Job #${tracked.jobId} - Stuck for ${Math.round(elapsed / 1000)}s`);
        if (tracked.transactionId && !tracked.isFree) {
          await apiRequest("/api/print/cancel", { transactionId: tracked.transactionId });
          console.log(`[REFUNDED] Job #${tracked.jobId} - Timed out, refunded`);
        }
        await cancelJob(tracked.printerName, tracked.jobId);
        trackedJobs.delete(key);

        if (!hasTrackedJobsForPrinter(tracked.printerName)) {
          await pausePrinter(tracked.printerName);
          console.log(`[CUPS] ${tracked.printerName} paused (no tracked jobs)`);
        }
      }
    } catch (error) {
      console.error(`[ERROR] Checking tracked job #${tracked.jobId}:`, error);
    }
  }
}

async function poll(): Promise<void> {
  try {
    await handleQueuedJobs();
    await checkTrackedJobs();
  } catch (error) {
    console.error("[POLL ERROR]", error);
  }
}

async function startPolling(): Promise<void> {
  await ensureQueuesPaused();
  while (true) {
    await poll();
    await sleep(POLL_INTERVAL);
  }
}

console.log("=== Print Middleware Starting (Ubuntu CUPS) ===");
console.log(`API URL: ${API_URL}`);
if (!PRINTER_COLOR || PRINTER_BW === PRINTER_COLOR) {
  console.log(`Printer: ${PRINTER_BW} (B&W only)`);
} else {
  console.log(`Printer B&W: ${PRINTER_BW}`);
  console.log(`Printer Color: ${PRINTER_COLOR}`);
}
console.log(`Poll interval: ${POLL_INTERVAL}ms`);
console.log("===============================================\n");

startPolling().catch((error) => {
  console.error("[FATAL] Polling loop crashed:", error);
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("\nShutting down print middleware...");
  if (trackedJobs.size > 0) {
    console.log(`Warning: ${trackedJobs.size} tracked jobs still in progress`);
  }
  process.exit(0);
});
