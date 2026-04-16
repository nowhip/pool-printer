/**
 * Print Middleware Script
 *
 * This script polls the Windows Print Spooler for paused jobs,
 * communicates with the Next.js API to reserve/confirm/cancel prints,
 * and manages print job lifecycle.
 *
 * Usage:
 *   npx tsx print-middleware/index.ts
 *
 * Environment variables:
 *   NEXTAUTH_URL   - Next.js API base URL (default: http://localhost:3000)
 *   API_KEY        - API key matching the Next.js backend
 *   POLL_INTERVAL  - Polling interval in ms (default: 3000)
 *   PRINTER_BW     - B&W printer name (default: PoolDrucker_SW)
 *   PRINTER_COLOR  - Color printer name (optional, no default)
 */

import { exec } from "child_process";
import { promisify } from "util";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local from project root
config({ path: resolve(__dirname, "..", ".env.local") });

const execAsync = promisify(exec);

/** Run a PowerShell command using -EncodedCommand to avoid escaping issues */
async function runPS(cmd: string): Promise<string> {
  const encoded = Buffer.from(cmd, "utf16le").toString("base64");
  const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`);
  return stdout.trim();
}

function psQuote(value: string): string {
  return value.replace(/'/g, "''");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message.split("\n")[0] : String(error);
}

// Configuration
const API_URL = process.env.NEXTAUTH_URL || "http://localhost:3000";
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error("ERROR: API_KEY environment variable is required.");
  process.exit(1);
}
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "3000", 10);
const PRINTER_BW = process.env.PRINTER_BW || "PoolDrucker_SW";
const PRINTER_COLOR = process.env.PRINTER_COLOR || ""; // empty = no color printer

// In-memory tracking of active print jobs
interface TrackedJob {
  jobId: number;
  transactionId: number | null;
  printerName: string;
  userId: string;
  isFree: boolean;
  resumedAt: number;
}

const trackedJobs = new Map<string, TrackedJob>(); // key: "printerName:jobId"

interface PrintJob {
  Id: number;
  JobId?: number;
  DocumentName: string;
  UserName: string;
  PrinterName: string;
  TotalPages: number;
  PagesPrinted: number;
  Copies: number;
  JobStatus: string;
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

function getPrinterType(printerName: string): "bw" | "color" {
  // If a color printer is configured and this job is on it, it's color
  if (PRINTER_COLOR && printerName === PRINTER_COLOR && PRINTER_COLOR !== PRINTER_BW) {
    return "color";
  }
  return "bw";
}

function jobKey(printerName: string, jobId: number): string {
  return `${printerName}:${jobId}`;
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

function hasTrackedJobsForPrinter(printerName: string): boolean {
  for (const tracked of trackedJobs.values()) {
    if (tracked.printerName === printerName) return true;
  }
  return false;
}

async function getPausedJobs(): Promise<PrintJob[]> {
  const printers = !PRINTER_COLOR || PRINTER_BW === PRINTER_COLOR
    ? [PRINTER_BW]
    : [PRINTER_BW, PRINTER_COLOR];
  const allJobs: PrintJob[] = [];

  for (const printer of printers) {
    try {
      const p = psQuote(printer);
      const cmd = `Get-PrintJob -PrinterName '${p}' -ErrorAction Stop | Where-Object { $_.JobStatus -notmatch 'Printed|Completed|Sent|Deleting|Deleted' } | Select-Object Id, DocumentName, UserName, PrinterName, TotalPages, PagesPrinted, @{Name='Copies';Expression={if($_.Copies){$_.Copies}else{1}}}, JobStatus | ConvertTo-Json -Depth 3`;
      const stdout = await runPS(cmd);

      if (!stdout) continue;

      const parsed = JSON.parse(stdout);
      const jobs: PrintJob[] = Array.isArray(parsed) ? parsed : [parsed];
      allJobs.push(...jobs);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("No print jobs")) {
        console.error(`[SPOOLER] Error querying ${printer}:`, msg.split("\n")[0]);
      }
    }
  }

  return allJobs;
}

async function getJobStatus(printerName: string, jobId: number): Promise<string | null> {
  try {
    const p = psQuote(printerName);
    const stdout = await runPS(`Get-PrintJob -PrinterName '${p}' -ID ${jobId} | Select-Object -ExpandProperty JobStatus`);
    return stdout || null;
  } catch {
    return null; // Job likely no longer exists (completed/removed)
  }
}

async function resumeJob(printerName: string, jobId: number): Promise<void> {
  const p = psQuote(printerName);
  await runPS(`Resume-PrintJob -PrinterName '${p}' -ID ${jobId} -ErrorAction Stop`);
}

async function setPrinterPausedState(printerName: string, pause: boolean): Promise<boolean> {
  const p = psQuote(printerName);
  const method = pause ? "Pause" : "Resume";
  const commandList = pause
    ? [
      `Suspend-Printer -Name '${p}' -ErrorAction Stop`,
      `Get-CimInstance -Class Win32_Printer -Filter "Name='${p}'" -ErrorAction Stop | Invoke-CimMethod -MethodName Pause -ErrorAction Stop | Out-Null`,
      `(Get-WmiObject -Class Win32_Printer -Filter "Name='${p}'" -ErrorAction Stop).Pause() | Out-Null`,
    ]
    : [
      `Resume-Printer -Name '${p}' -ErrorAction Stop`,
      `Get-CimInstance -Class Win32_Printer -Filter "Name='${p}'" -ErrorAction Stop | Invoke-CimMethod -MethodName Resume -ErrorAction Stop | Out-Null`,
      `(Get-WmiObject -Class Win32_Printer -Filter "Name='${p}'" -ErrorAction Stop).Resume() | Out-Null`,
    ];

  let lastError = "";
  for (const cmd of commandList) {
    try {
      await runPS(cmd);
      return true;
    } catch (error) {
      lastError = formatError(error);
    }
  }

  console.error(`[PRINTER] Failed to ${method.toLowerCase()} ${printerName}: ${lastError || "unknown error"}`);
  return false;
}

async function unpausePrinter(printerName: string): Promise<boolean> {
  return setPrinterPausedState(printerName, false);
}

async function pausePrinter(printerName: string): Promise<boolean> {
  return setPrinterPausedState(printerName, true);
}

async function jobExists(printerName: string, jobId: number): Promise<boolean> {
  const p = psQuote(printerName);
  try {
    const stdout = await runPS(
      `$j = Get-PrintJob -PrinterName '${p}' -ID ${jobId} -ErrorAction SilentlyContinue; if ($null -eq $j) { '0' } else { '1' }`
    );
    return stdout.trim() === "1";
  } catch {
    return false;
  }
}

async function removeJob(printerName: string, jobId: number): Promise<boolean> {
  if (!(await jobExists(printerName, jobId))) return true;

  const p = psQuote(printerName);
  const commandList = [
    `Remove-PrintJob -PrinterName '${p}' -ID ${jobId} -ErrorAction Stop`,
    `Get-PrintJob -PrinterName '${p}' -ID ${jobId} -ErrorAction Stop | Remove-PrintJob -ErrorAction Stop`,
    `$j = Get-WmiObject -Class Win32_PrintJob -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '${p},*' -and $_.JobId -eq ${jobId} } | Select-Object -First 1; if ($j) { $j.Delete() | Out-Null } else { throw 'Job not found' }`,
  ];

  let lastError = "";
  for (const cmd of commandList) {
    try {
      await runPS(cmd);
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

async function handlePausedJobs(): Promise<void> {
  const pausedJobs = await getPausedJobs();

  for (const job of pausedJobs) {
    const id = job.Id || job.JobId;
    if (!id) continue;

    const key = jobKey(job.PrinterName, id);

    // Skip if already tracked (already being processed)
    if (trackedJobs.has(key)) continue;

    const printerType = getPrinterType(job.PrinterName);
    const copies = job.Copies || 1;
    const pages = (job.TotalPages || 1) * copies;
    const userId = normalizeUserId(job.UserName || "") || "unknown";

    console.log(`[NEW] Job #${id} from ${userId} on ${job.PrinterName} (${job.TotalPages || 1} pages x ${copies} copies = ${pages} total, ${printerType}, status: ${job.JobStatus})`);

    try {
      // Call reserve API
      const result = await apiRequest("/api/print/reserve", {
        userId,
        pages,
        printerType,
        jobKey: key,
      });

      if (result.allowed) {
        // Unpause the printer so the job can actually print
        await unpausePrinter(job.PrinterName);
        // Resume the individual job in case it was paused
        try { await resumeJob(job.PrinterName, id); } catch { /* already running */ }

        const tracked: TrackedJob = {
          jobId: id,
          transactionId: (result.transactionId as number) || null,
          printerName: job.PrinterName,
          userId,
          isFree: !!result.isFree,
          resumedAt: Date.now(),
        };

        trackedJobs.set(key, tracked);
        console.log(
          `[RESUMED] Job #${id} - ${result.isFree ? "FREE" : `Transaction #${result.transactionId}${result.deduplicated ? " (deduplicated)" : ""}`}`
        );
      } else {
        // Not allowed - reject and remove the job immediately from the queue
        console.log(`[DENIED] Job #${id} from ${userId}: ${result.reason}`);
        console.log(`        Balance: ${result.balance || 'N/A'}, Required: ${result.required || 'N/A'}`);
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
}

async function checkTrackedJobs(): Promise<void> {
  for (const [key, tracked] of trackedJobs.entries()) {
    try {
      const status = await getJobStatus(tracked.printerName, tracked.jobId);

      if (status === null) {
        // Job no longer exists - likely printed successfully
        if (tracked.transactionId && !tracked.isFree) {
          await apiRequest("/api/print/confirm", { transactionId: tracked.transactionId });
          console.log(`[COMPLETED] Job #${tracked.jobId} - Transaction #${tracked.transactionId} confirmed`);
        } else {
          console.log(`[COMPLETED] Job #${tracked.jobId} (free account)`);
        }
        trackedJobs.delete(key);
        // Re-pause printer if no more tracked jobs for this printer
        if (!hasTrackedJobsForPrinter(tracked.printerName)) {
          await pausePrinter(tracked.printerName);
          console.log(`[PRINTER] ${tracked.printerName} paused (no pending jobs)`);
        }
        continue;
      }

      // Check for printed/completed status
      if (status.match(/Printed|Completed|Sent/i)) {
        if (tracked.transactionId && !tracked.isFree) {
          await apiRequest("/api/print/confirm", { transactionId: tracked.transactionId });
          console.log(`[CONFIRMED] Job #${tracked.jobId} - Status: ${status}`);
        }
        // Try to clean up the job
        const removed = await removeJob(tracked.printerName, tracked.jobId);
        if (!removed) {
          console.warn(`[CLEANUP] Job #${tracked.jobId} is still present in ${tracked.printerName}`);
        }
        trackedJobs.delete(key);
        // Re-pause printer if no more tracked jobs
        if (!hasTrackedJobsForPrinter(tracked.printerName)) {
          await pausePrinter(tracked.printerName);
          console.log(`[PRINTER] ${tracked.printerName} paused (no pending jobs)`);
        }
        continue;
      }

      // Check for error status
      if (status.match(/Error|Offline|PaperOut|Deleting/i)) {
        if (tracked.transactionId && !tracked.isFree) {
          await apiRequest("/api/print/cancel", { transactionId: tracked.transactionId });
          console.log(`[CANCELLED] Job #${tracked.jobId} - Error: ${status}, refunded`);
        }
        await cancelJob(tracked.printerName, tracked.jobId);
        trackedJobs.delete(key);
        // Re-pause printer if no more tracked jobs
        if (!hasTrackedJobsForPrinter(tracked.printerName)) {
          await pausePrinter(tracked.printerName);
          console.log(`[PRINTER] ${tracked.printerName} paused (no pending jobs)`);
        }
        continue;
      }

      // Check for timeout (5 minutes)
      const elapsed = Date.now() - tracked.resumedAt;
      if (elapsed > 5 * 60 * 1000) {
        console.log(`[TIMEOUT] Job #${tracked.jobId} - Stuck for ${Math.round(elapsed / 1000)}s`);
        if (tracked.transactionId && !tracked.isFree) {
          await apiRequest("/api/print/cancel", { transactionId: tracked.transactionId });
          console.log(`[REFUNDED] Job #${tracked.jobId} - Timed out, refunded`);
        }
        await cancelJob(tracked.printerName, tracked.jobId);
        trackedJobs.delete(key);
        // Re-pause printer if no more tracked jobs
        if (!hasTrackedJobsForPrinter(tracked.printerName)) {
          await pausePrinter(tracked.printerName);
          console.log(`[PRINTER] ${tracked.printerName} paused (no pending jobs)`);
        }
      }
    } catch (error) {
      console.error(`[ERROR] Checking tracked job #${tracked.jobId}:`, error);
    }
  }
}

async function poll(): Promise<void> {
  try {
    await handlePausedJobs();
    await checkTrackedJobs();
  } catch (error) {
    console.error("[POLL ERROR]", error);
  }
}

async function startPolling(): Promise<void> {
  while (true) {
    await poll();
    await sleep(POLL_INTERVAL);
  }
}

// Main entry point
console.log("=== Print Middleware Starting ===");
console.log(`API URL: ${API_URL}`);
if (!PRINTER_COLOR || PRINTER_BW === PRINTER_COLOR) {
  console.log(`Printer: ${PRINTER_BW} (B&W only)`);
} else {
  console.log(`Printer B&W: ${PRINTER_BW}`);
  console.log(`Printer Color: ${PRINTER_COLOR}`);
}
console.log(`Poll interval: ${POLL_INTERVAL}ms`);
console.log("================================\n");

// Start sequential polling loop (no overlapping runs)
startPolling().catch((error) => {
  console.error("[FATAL] Polling loop crashed:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down print middleware...");
  if (trackedJobs.size > 0) {
    console.log(`Warning: ${trackedJobs.size} tracked jobs still in progress`);
  }
  process.exit(0);
});
