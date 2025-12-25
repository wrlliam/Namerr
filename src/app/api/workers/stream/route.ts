/**
 * Server-Sent Events (SSE) endpoint for real-time worker logs and statistics
 */

import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import {
  workerRealtimeLogs,
  workerStatistics,
  workerInstances,
} from "@/src/lib/db/schema";
import { desc, gt } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  // Create a ReadableStream for Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE message
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial connection message
      sendEvent("connected", { message: "Connected to worker stream" });

      // Track last seen IDs to avoid duplicates
      let lastLogId: string | null = null;
      let lastStatId: string | null = null;

      // Polling interval
      const pollInterval = setInterval(async () => {
        try {
          // Fetch new logs
          const logsQuery = db
            .select({
              id: workerRealtimeLogs.id,
              workerId: workerRealtimeLogs.workerId,
              jobId: workerRealtimeLogs.jobId,
              level: workerRealtimeLogs.level,
              message: workerRealtimeLogs.message,
              metadata: workerRealtimeLogs.metadata,
              timestamp: workerRealtimeLogs.timestamp,
            })
            .from(workerRealtimeLogs)
            .orderBy(desc(workerRealtimeLogs.timestamp))
            .limit(50);

          if (lastLogId) {
            logsQuery.where(gt(workerRealtimeLogs.id, lastLogId));
          }

          const newLogs = await logsQuery;

          if (newLogs.length > 0) {
            lastLogId = newLogs[0].id;
            sendEvent("logs", newLogs.reverse()); // Reverse to chronological order
          }

          // Fetch latest statistics for all workers
          const latestStats = await db
            .select({
              id: workerStatistics.id,
              workerId: workerStatistics.workerId,
              cpuUsage: workerStatistics.cpuUsage,
              memoryUsage: workerStatistics.memoryUsage,
              memoryUsagePercent: workerStatistics.memoryUsagePercent,
              filesProcessed: workerStatistics.filesProcessed,
              filesSucceeded: workerStatistics.filesSucceeded,
              filesFailed: workerStatistics.filesFailed,
              filesSkipped: workerStatistics.filesSkipped,
              currentJobId: workerStatistics.currentJobId,
              currentJobProgress: workerStatistics.currentJobProgress,
              timestamp: workerStatistics.timestamp,
            })
            .from(workerStatistics)
            .orderBy(desc(workerStatistics.timestamp))
            .limit(10);

          if (latestStats.length > 0 && latestStats[0].id !== lastStatId) {
            lastStatId = latestStats[0].id;
            sendEvent("statistics", latestStats);
          }

          // Fetch worker statuses
          const workers = await db
            .select({
              id: workerInstances.id,
              name: workerInstances.name,
              hostname: workerInstances.hostname,
              type: workerInstances.type,
              status: workerInstances.status,
              pid: workerInstances.pid,
              lastHeartbeat: workerInstances.lastHeartbeat,
              startedAt: workerInstances.startedAt,
            })
            .from(workerInstances)
            .orderBy(desc(workerInstances.lastHeartbeat))
            .limit(20);

          sendEvent("workers", workers);
        } catch (error) {
          console.error("Error in SSE stream:", error);
        }
      }, 2000); // Poll every 2 seconds

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(pollInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
