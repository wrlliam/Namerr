/**
 * Cron scheduler for automated renaming jobs
 * Runs every 4 hours
 */

import * as cron from "node-cron";
import { db } from "./lib/db";
import {
  mediaLibraries,
  workerJobs,
  type MediaLibrary,
  type NewWorkerJob,
} from "../../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";
import { QueueProcessor } from "./queue-processor";
import { WorkerHeartbeat } from "./lib/heartbeat";

export class Scheduler {
  private task: cron.ScheduledTask | null = null;
  private processor: QueueProcessor;
  private heartbeat: WorkerHeartbeat | null = null;
  private startupTimeout: NodeJS.Timeout | null = null;

  constructor(heartbeat?: WorkerHeartbeat) {
    this.heartbeat = heartbeat || null;
    this.processor = new QueueProcessor(heartbeat);
  }

  /**
   * Create rename jobs for all enabled libraries
   */
  private async createRenameJobs(): Promise<void> {
    logger.info("Creating rename jobs for enabled libraries");

    try {
      const libraries: MediaLibrary[] = await db
        .select()
        .from(mediaLibraries)
        .where(eq(mediaLibraries.enabled, true));

      logger.info(`Found ${libraries.length} enabled libraries`);

      for (const library of libraries) {
        // Create a rename job for this library
        const jobData: NewWorkerJob = {
          type: "rename",
          libraryId: library.id,
          status: "queued",
          progress: 0,
          totalItems: 0,
          processedItems: 0,
          errorCount: 0,
          dryRun: false, // Will be overridden by system config
        };

        const [job] = await db
          .insert(workerJobs)
          .values(jobData)
          .returning();

        if (job) {
          logger.info(`Created rename job for library: ${library.name}`, {
            jobId: job.id,
            libraryId: library.id,
          });
        }
      }

      // Process the jobs
      await this.processor.processPendingJobs();
    } catch (error: unknown) {
      logger.error("Error creating rename jobs", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start the scheduler
   * Runs every 4 hours (cron pattern: 0 star-slash-4 star star star)
   */
  start(): void {
    logger.info("Starting scheduler (every 4 hours)");

    // Schedule: At minute 0 past every 4th hour
    this.task = cron.schedule("0 */4 * * *", (): void => {
      logger.info("Scheduler triggered");
      this.createRenameJobs().catch((error: unknown) => {
        logger.error("Error in scheduled job", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });

    logger.info("Scheduler started successfully");

    // Also run once on startup (optional, can be disabled)
    this.startupTimeout = setTimeout((): void => {
      logger.info("Running initial job creation on startup");
      this.createRenameJobs().catch((error: unknown) => {
        logger.error("Error in startup job", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, 5000); // Wait 5 seconds after startup
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info("Scheduler stopped");
    }

    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
      logger.info("Startup timeout cleared");
    }
  }

  /**
   * Manually trigger job creation and processing
   */
  async triggerNow(): Promise<void> {
    logger.info("Manually triggering job creation");
    await this.createRenameJobs();
  }
}
