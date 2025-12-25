/**
 * Worker heartbeat and statistics reporter
 * Reports worker health and metrics to the database
 */

import { db } from "./db";
import {
  workerInstances,
  workerStatistics,
  workerRealtimeLogs,
} from "../../../src/lib/db/schema";
import { eq } from "drizzle-orm";
import * as os from "os";
import { logger } from "./logger";

export class WorkerHeartbeat {
  private workerId: string | null = null;
  private interval: NodeJS.Timeout | null = null;
  private heartbeatIntervalMs = 10000; // 10 seconds
  private statsIntervalMs = 5000; // 5 seconds
  private statsInterval: NodeJS.Timeout | null = null;
  private currentJobId: string | null = null;
  private currentJobProgress: number = 0;
  private filesProcessed = 0;
  private filesSucceeded = 0;
  private filesFailed = 0;
  private filesSkipped = 0;

  constructor() {}

  /**
   * Register this worker instance in the database
   */
  async register(name: string, type: "local" | "remote" = "local"): Promise<void> {
    try {
      const hostname = os.hostname();
      const pid = process.pid;
      const version = process.env.npm_package_version || "1.0.0";

      const [worker] = await db
        .insert(workerInstances)
        .values({
          name,
          hostname,
          type,
          status: "starting",
          pid,
          version,
          lastHeartbeat: new Date(),
        })
        .returning();

      this.workerId = worker.id;
      logger.info("Worker registered", {
        workerId: this.workerId,
        name,
        hostname,
        pid,
      });

      // Start heartbeat
      this.startHeartbeat();

      // Start statistics reporting
      this.startStatistics();

      // Mark as running
      await this.updateStatus("running");
    } catch (error) {
      logger.error("Failed to register worker", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Start sending heartbeats
   */
  private startHeartbeat(): void {
    this.interval = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.heartbeatIntervalMs);

    logger.info("Heartbeat started", {
      intervalMs: this.heartbeatIntervalMs,
    });
  }

  /**
   * Start reporting statistics
   */
  private startStatistics(): void {
    this.statsInterval = setInterval(async () => {
      await this.reportStatistics();
    }, this.statsIntervalMs);

    logger.info("Statistics reporting started", {
      intervalMs: this.statsIntervalMs,
    });
  }

  /**
   * Send heartbeat to database
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.workerId) return;

    try {
      await db
        .update(workerInstances)
        .set({
          lastHeartbeat: new Date(),
          status: "running",
        })
        .where(eq(workerInstances.id, this.workerId));
    } catch (error) {
      logger.error("Failed to send heartbeat", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Report current statistics
   */
  private async reportStatistics(): Promise<void> {
    if (!this.workerId) return;

    try {
      const cpuUsage = this.getCpuUsage();
      const memoryUsage = this.getMemoryUsage();

      await db.insert(workerStatistics).values({
        workerId: this.workerId,
        cpuUsage: cpuUsage.toString(),
        memoryUsage: memoryUsage.bytes,
        memoryUsagePercent: memoryUsage.percent.toString(),
        filesProcessed: this.filesProcessed,
        filesSucceeded: this.filesSucceeded,
        filesFailed: this.filesFailed,
        filesSkipped: this.filesSkipped,
        currentJobId: this.currentJobId,
        currentJobProgress: this.currentJobProgress,
      });
    } catch (error) {
      logger.error("Failed to report statistics", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get CPU usage percentage
   */
  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~((100 * idle) / total);

    return usage;
  }

  /**
   * Get memory usage
   */
  private getMemoryUsage(): { bytes: number; percent: number } {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const percent = (usedMemory / totalMemory) * 100;

    return {
      bytes: usedMemory,
      percent: Math.round(percent * 100) / 100,
    };
  }

  /**
   * Update worker status
   */
  async updateStatus(status: "starting" | "running" | "stopping" | "stopped" | "error"): Promise<void> {
    if (!this.workerId) return;

    try {
      await db
        .update(workerInstances)
        .set({ status })
        .where(eq(workerInstances.id, this.workerId));

      logger.info("Worker status updated", { status });
    } catch (error) {
      logger.error("Failed to update worker status", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Set current job being processed
   */
  setCurrentJob(jobId: string | null, progress: number = 0): void {
    this.currentJobId = jobId;
    this.currentJobProgress = progress;
  }

  /**
   * Increment file counters
   */
  incrementFileCount(status: "success" | "error" | "skipped"): void {
    this.filesProcessed++;

    switch (status) {
      case "success":
        this.filesSucceeded++;
        break;
      case "error":
        this.filesFailed++;
        break;
      case "skipped":
        this.filesSkipped++;
        break;
    }
  }

  /**
   * Reset file counters
   */
  resetFileCounters(): void {
    this.filesProcessed = 0;
    this.filesSucceeded = 0;
    this.filesFailed = 0;
    this.filesSkipped = 0;
  }

  /**
   * Log a real-time message to the database
   */
  async log(
    level: "info" | "warn" | "error" | "debug",
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    if (!this.workerId) return;

    try {
      await db.insert(workerRealtimeLogs).values({
        workerId: this.workerId,
        jobId: this.currentJobId,
        level,
        message,
        metadata: metadata || null,
      });
    } catch (error) {
      // Don't log errors for logging failures (avoid infinite loop)
      console.error("Failed to log real-time message:", error);
    }
  }

  /**
   * Unregister worker and stop heartbeat
   */
  async unregister(): Promise<void> {
    if (!this.workerId) return;

    try {
      // Stop intervals
      if (this.interval) {
        clearInterval(this.interval);
        this.interval = null;
      }

      if (this.statsInterval) {
        clearInterval(this.statsInterval);
        this.statsInterval = null;
      }

      // Update status
      await db
        .update(workerInstances)
        .set({
          status: "stopped",
          stoppedAt: new Date(),
        })
        .where(eq(workerInstances.id, this.workerId));

      logger.info("Worker unregistered", { workerId: this.workerId });
      this.workerId = null;
    } catch (error) {
      logger.error("Failed to unregister worker", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get worker ID
   */
  getWorkerId(): string | null {
    return this.workerId;
  }
}
