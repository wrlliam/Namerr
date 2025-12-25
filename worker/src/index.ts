/**
 * Worker Service - Main Entry Point
 * Background service for automated media renaming
 */

import { logger } from "./lib/logger";
import { closeDatabase } from "./lib/db";
import { Scheduler } from "./scheduler";
import { WorkerHeartbeat } from "./lib/heartbeat";
import * as os from "os";

let scheduler: Scheduler;
let heartbeat: WorkerHeartbeat;

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    // Unregister worker
    if (heartbeat) {
      await heartbeat.updateStatus("stopping");
      await heartbeat.unregister();
    }

    // Stop scheduler
    if (scheduler) {
      scheduler.stop();
    }

    // Close database connection
    await closeDatabase();

    logger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error("Error during shutdown", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  logger.info("Starting Namerr Worker Service");
  logger.info("Environment:", {
    nodeEnv: process.env.NODE_ENV || "development",
    databaseUrl: process.env.DATABASE_URL ? "configured" : "using default",
    hostname: os.hostname(),
    pid: process.pid,
  });

  try {
    // Initialize and register heartbeat
    heartbeat = new WorkerHeartbeat();
    const workerName = process.env.WORKER_NAME || `worker-${os.hostname()}`;
    await heartbeat.register(workerName, "local");

    // Initialize scheduler with heartbeat
    scheduler = new Scheduler(heartbeat);
    scheduler.start();

    logger.info("Worker service is running");
  } catch (error) {
    logger.error("Fatal error during startup", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Update status to error if heartbeat is initialized
    if (heartbeat) {
      await heartbeat.updateStatus("error");
    }

    process.exit(1);
  }
}

// Handle process signals
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    error: error.message,
    stack: error.stack,
  });
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", {
    reason: String(reason),
  });
  shutdown("unhandledRejection");
});

// Start the service
main();
