/**
 * Worker Supervisor
 * Monitors worker health and automatically recovers failed workers
 */

import { db } from "./db";
import { workerInstances } from "./db/schema";
import { eq, lt, and } from "drizzle-orm";
import { spawnLocalWorker, spawnRemoteWorker } from "./worker-manager";
import { WorkerError, logError } from "./errors";

export interface RestartPolicy {
  /**
   * always - Always restart the worker when it stops
   * on-failure - Only restart if worker exits with error
   * never - Never restart automatically
   */
  policy: "always" | "on-failure" | "never";

  /**
   * Maximum number of restart attempts before giving up
   */
  maxRestarts: number;

  /**
   * Time window in milliseconds for restart attempts
   * Resets the restart counter after this period
   */
  restartWindow: number;

  /**
   * Initial delay before first restart (ms)
   */
  initialDelay: number;

  /**
   * Backoff multiplier for subsequent restarts
   */
  backoffMultiplier: number;

  /**
   * Maximum delay between restarts (ms)
   */
  maxDelay: number;
}

const DEFAULT_RESTART_POLICY: RestartPolicy = {
  policy: "on-failure",
  maxRestarts: 5,
  restartWindow: 300000, // 5 minutes
  initialDelay: 1000, // 1 second
  backoffMultiplier: 2,
  maxDelay: 60000, // 1 minute
};

interface WorkerRestartState {
  workerId: string;
  attempts: number;
  lastAttempt: number;
  nextDelay: number;
}

export class WorkerSupervisor {
  private restartStates: Map<string, WorkerRestartState> = new Map();
  private monitorInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private restartPolicy: RestartPolicy;

  constructor(restartPolicy: Partial<RestartPolicy> = {}) {
    this.restartPolicy = { ...DEFAULT_RESTART_POLICY, ...restartPolicy };
  }

  /**
   * Start monitoring workers
   */
  start(intervalMs: number = 10000) {
    if (this.isRunning) {
      console.log("[Worker Supervisor] Already running");
      return;
    }

    console.log(`[Worker Supervisor] Starting with ${intervalMs}ms interval`);
    this.isRunning = true;

    // Run immediately
    this.monitorWorkers();

    // Then run on interval
    this.monitorInterval = setInterval(() => {
      this.monitorWorkers();
    }, intervalMs);
  }

  /**
   * Stop monitoring workers
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    console.log("[Worker Supervisor] Stopping");
    this.isRunning = false;

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Monitor all workers for health issues
   */
  private async monitorWorkers() {
    try {
      const workers = await db.select().from(workerInstances);
      const now = new Date();

      for (const worker of workers) {
        // Skip if worker is intentionally stopped
        if (worker.status === "stopped") {
          continue;
        }

        // Check if worker is stale (no heartbeat in 30 seconds)
        const isStale =
          worker.lastHeartbeat &&
          now.getTime() - new Date(worker.lastHeartbeat).getTime() > 30000;

        // Check if worker is in error state
        const isError = worker.status === "error";

        if (isStale || isError) {
          console.log(
            `[Worker Supervisor] Detected ${isStale ? "stale" : "error"} worker: ${worker.id} (${worker.name})`
          );

          // Update status to error if stale
          if (isStale && worker.status !== "error") {
            await db
              .update(workerInstances)
              .set({ status: "error" })
              .where(eq(workerInstances.id, worker.id));
          }

          // Attempt to restart based on policy
          await this.handleFailedWorker(worker);
        }

        // Clean up restart states for workers that have recovered
        if (worker.status === "running" && this.restartStates.has(worker.id)) {
          console.log(`[Worker Supervisor] Worker ${worker.id} recovered, clearing restart state`);
          this.restartStates.delete(worker.id);
        }
      }

      // Clean up old restart states
      this.cleanupRestartStates();
    } catch (error) {
      logError(
        new WorkerError("Worker monitoring failed", undefined, {
          error: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  /**
   * Handle a failed worker based on restart policy
   */
  private async handleFailedWorker(
    worker: typeof workerInstances.$inferSelect
  ): Promise<void> {
    // Check restart policy
    if (this.restartPolicy.policy === "never") {
      return;
    }

    // Get or create restart state
    let restartState = this.restartStates.get(worker.id);
    const now = Date.now();

    if (!restartState) {
      restartState = {
        workerId: worker.id,
        attempts: 0,
        lastAttempt: 0,
        nextDelay: this.restartPolicy.initialDelay,
      };
      this.restartStates.set(worker.id, restartState);
    }

    // Reset attempts if outside restart window
    if (
      restartState.lastAttempt &&
      now - restartState.lastAttempt > this.restartPolicy.restartWindow
    ) {
      console.log(
        `[Worker Supervisor] Restart window expired for ${worker.id}, resetting attempts`
      );
      restartState.attempts = 0;
      restartState.nextDelay = this.restartPolicy.initialDelay;
    }

    // Check if max restarts exceeded
    if (restartState.attempts >= this.restartPolicy.maxRestarts) {
      console.log(
        `[Worker Supervisor] Max restart attempts (${this.restartPolicy.maxRestarts}) reached for ${worker.id}`
      );
      return;
    }

    // Wait for backoff delay
    const timeSinceLastAttempt = now - restartState.lastAttempt;
    if (timeSinceLastAttempt < restartState.nextDelay) {
      return; // Not time yet
    }

    // Attempt restart
    console.log(
      `[Worker Supervisor] Attempting restart ${restartState.attempts + 1}/${this.restartPolicy.maxRestarts} for ${worker.id} (${worker.name})`
    );

    restartState.attempts++;
    restartState.lastAttempt = now;

    // Calculate next delay with exponential backoff
    restartState.nextDelay = Math.min(
      restartState.nextDelay * this.restartPolicy.backoffMultiplier,
      this.restartPolicy.maxDelay
    );

    // Update worker status
    await db
      .update(workerInstances)
      .set({ status: "starting" })
      .where(eq(workerInstances.id, worker.id));

    try {
      if (worker.type === "local") {
        const result = await spawnLocalWorker(worker.id, worker.name);

        if (result.success) {
          console.log(`[Worker Supervisor] Successfully restarted local worker ${worker.id}`);

          // Update with new PID
          if (result.pid) {
            await db
              .update(workerInstances)
              .set({ pid: result.pid })
              .where(eq(workerInstances.id, worker.id));
          }
        } else {
          console.error(
            `[Worker Supervisor] Failed to restart local worker ${worker.id}: ${result.error}`
          );
          await db
            .update(workerInstances)
            .set({ status: "error" })
            .where(eq(workerInstances.id, worker.id));
        }
      } else if (worker.type === "remote" && worker.sshHostId) {
        const result = await spawnRemoteWorker(worker.id, worker.name, worker.sshHostId);

        if (result.success) {
          console.log(`[Worker Supervisor] Successfully restarted remote worker ${worker.id}`);
        } else {
          console.error(
            `[Worker Supervisor] Failed to restart remote worker ${worker.id}: ${result.error}`
          );
          await db
            .update(workerInstances)
            .set({ status: "error" })
            .where(eq(workerInstances.id, worker.id));
        }
      }
    } catch (error) {
      console.error(`[Worker Supervisor] Error restarting worker ${worker.id}:`, error);
      await db
        .update(workerInstances)
        .set({ status: "error" })
        .where(eq(workerInstances.id, worker.id));
    }
  }

  /**
   * Clean up restart states that are no longer needed
   */
  private cleanupRestartStates() {
    const now = Date.now();
    const cleanupThreshold = this.restartPolicy.restartWindow * 2;

    for (const [workerId, state] of this.restartStates.entries()) {
      if (now - state.lastAttempt > cleanupThreshold) {
        this.restartStates.delete(workerId);
      }
    }
  }

  /**
   * Get restart state for a worker
   */
  getRestartState(workerId: string): WorkerRestartState | undefined {
    return this.restartStates.get(workerId);
  }

  /**
   * Get all restart states
   */
  getAllRestartStates(): Map<string, WorkerRestartState> {
    return new Map(this.restartStates);
  }

  /**
   * Clear restart state for a specific worker
   */
  clearRestartState(workerId: string) {
    this.restartStates.delete(workerId);
  }

  /**
   * Update restart policy
   */
  updateRestartPolicy(policy: Partial<RestartPolicy>) {
    this.restartPolicy = { ...this.restartPolicy, ...policy };
    console.log("[Worker Supervisor] Restart policy updated:", this.restartPolicy);
  }
}

/**
 * Global supervisor instance
 * In production, this should be a singleton managed by the main process
 */
let globalSupervisor: WorkerSupervisor | null = null;

/**
 * Get or create the global worker supervisor
 */
export function getWorkerSupervisor(): WorkerSupervisor {
  if (!globalSupervisor) {
    globalSupervisor = new WorkerSupervisor();
  }
  return globalSupervisor;
}

/**
 * Start the global worker supervisor
 */
export function startWorkerSupervisor(intervalMs?: number) {
  const supervisor = getWorkerSupervisor();
  supervisor.start(intervalMs);
  return supervisor;
}

/**
 * Stop the global worker supervisor
 */
export function stopWorkerSupervisor() {
  if (globalSupervisor) {
    globalSupervisor.stop();
  }
}
