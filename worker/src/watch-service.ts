/**
 * WatchService - Manages file watchers and processes pending events
 */

import { db } from "./lib/db";
import {
  mediaLibraries,
  watchEvents,
  mediaFiles,
} from "../../src/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { fileWatcher } from "./lib/file-watcher";
import { scanLibraryPath, getFileInfo } from "../../src/lib/file-scanner";
import { logger } from "./lib/logger";
import * as path from "path";

export class WatchService {
  private configPollInterval: ReturnType<typeof setInterval> | null = null;
  private eventProcessInterval: ReturnType<typeof setInterval> | null = null;
  private serviceLogger = logger.child({ component: "WatchService" });
  private isProcessing = false;

  /**
   * Initialize the watch service
   * Starts watchers for all libraries with watch enabled
   */
  async initialize(): Promise<void> {
    this.serviceLogger.info("Initializing watch service");

    try {
      // Get all libraries with watch enabled
      const libraries = await db
        .select()
        .from(mediaLibraries)
        .where(eq(mediaLibraries.watchEnabled, true));

      this.serviceLogger.info(`Found ${libraries.length} libraries with watch enabled`);

      // Start watchers for each library
      for (const library of libraries) {
        try {
          await fileWatcher.startWatching({
            id: library.id,
            path: library.path,
            type: library.type,
            watchDebounceMs: library.watchDebounceMs,
          });
        } catch (error) {
          this.serviceLogger.error(`Failed to start watcher for library ${library.id}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      this.serviceLogger.error("Failed to initialize watch service", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start polling for configuration changes
   * Checks for newly enabled/disabled watches
   */
  startConfigPolling(intervalMs: number = 60000): void {
    if (this.configPollInterval) {
      clearInterval(this.configPollInterval);
    }

    this.configPollInterval = setInterval(async () => {
      await this.syncWatchers();
    }, intervalMs);

    this.serviceLogger.info(`Config polling started (interval: ${intervalMs}ms)`);
  }

  /**
   * Sync watchers with database configuration
   */
  private async syncWatchers(): Promise<void> {
    try {
      const libraries = await db.select().from(mediaLibraries);
      const activeWatchers = new Set(fileWatcher.getActiveWatchers());

      for (const library of libraries) {
        const isWatching = activeWatchers.has(library.id);

        if (library.watchEnabled && !isWatching) {
          // Start watching
          this.serviceLogger.info(`Starting watcher for newly enabled library ${library.id}`);
          try {
            await fileWatcher.startWatching({
              id: library.id,
              path: library.path,
              type: library.type,
              watchDebounceMs: library.watchDebounceMs,
            });
          } catch (error) {
            this.serviceLogger.error(`Failed to start watcher for library ${library.id}`, {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else if (!library.watchEnabled && isWatching) {
          // Stop watching
          this.serviceLogger.info(`Stopping watcher for disabled library ${library.id}`);
          await fileWatcher.stopWatching(library.id);
        }

        activeWatchers.delete(library.id);
      }

      // Stop watchers for deleted libraries
      for (const libraryId of activeWatchers) {
        this.serviceLogger.info(`Stopping watcher for deleted library ${libraryId}`);
        await fileWatcher.stopWatching(libraryId);
      }
    } catch (error) {
      this.serviceLogger.error("Failed to sync watchers", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Start processing pending events
   */
  startEventProcessing(intervalMs: number = 10000): void {
    if (this.eventProcessInterval) {
      clearInterval(this.eventProcessInterval);
    }

    this.eventProcessInterval = setInterval(async () => {
      await this.processPendingEvents();
    }, intervalMs);

    this.serviceLogger.info(`Event processing started (interval: ${intervalMs}ms)`);
  }

  /**
   * Process pending watch events
   */
  async processPendingEvents(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get pending events
      const pendingEvents = await db
        .select()
        .from(watchEvents)
        .where(eq(watchEvents.status, "pending"))
        .limit(50);

      if (pendingEvents.length === 0) {
        return;
      }

      this.serviceLogger.info(`Processing ${pendingEvents.length} pending events`);

      for (const event of pendingEvents) {
        try {
          await this.processEvent(event);
        } catch (error) {
          this.serviceLogger.error(`Failed to process event ${event.id}`, {
            error: error instanceof Error ? error.message : String(error),
          });

          // Mark as error
          await db
            .update(watchEvents)
            .set({
              status: "error" as any,
              error: error instanceof Error ? error.message : String(error),
              processedAt: new Date(),
            })
            .where(eq(watchEvents.id, event.id));
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single watch event
   */
  private async processEvent(event: typeof watchEvents.$inferSelect): Promise<void> {
    const { id, libraryId, eventType, filePath } = event;

    // Get library
    const [library] = await db
      .select()
      .from(mediaLibraries)
      .where(eq(mediaLibraries.id, libraryId))
      .limit(1);

    if (!library) {
      this.serviceLogger.warn(`Library ${libraryId} not found for event ${id}`);
      await db
        .update(watchEvents)
        .set({ status: "ignored", processedAt: new Date() })
        .where(eq(watchEvents.id, id));
      return;
    }

    if (eventType === "add" || eventType === "change") {
      // Check if file already exists in database
      const relativePath = path.relative(library.path, filePath);
      const existingFiles = await db
        .select({ id: mediaFiles.id })
        .from(mediaFiles)
        .where(
          and(
            eq(mediaFiles.libraryId, libraryId),
            eq(mediaFiles.filePath, filePath)
          )
        )
        .limit(1);

      if (existingFiles.length > 0) {
        // File already tracked
        this.serviceLogger.debug(`File already tracked: ${relativePath}`);
        await db
          .update(watchEvents)
          .set({ status: "ignored", processedAt: new Date() })
          .where(eq(watchEvents.id, id));
        return;
      }

      // Get file info
      const fileInfo = await getFileInfo(filePath, library.path);
      if (!fileInfo) {
        this.serviceLogger.warn(`Could not get file info for: ${filePath}`);
        await db
          .update(watchEvents)
          .set({ status: "ignored", processedAt: new Date() })
          .where(eq(watchEvents.id, id));
        return;
      }

      // Add file to database
      await db.insert(mediaFiles).values({
        libraryId,
        filePath: fileInfo.filePath,
        fileName: fileInfo.fileName,
        fileSize: fileInfo.fileSize,
        fileExtension: fileInfo.fileExtension,
        renameStatus: "pending",
      });

      this.serviceLogger.info(`Added new file from watch: ${fileInfo.fileName}`);
    } else if (eventType === "unlink") {
      // File was deleted - we could mark it in the database
      // For now, just log it
      this.serviceLogger.info(`File deleted: ${path.basename(filePath)}`);
    }

    // Mark event as processed
    await db
      .update(watchEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(watchEvents.id, id));
  }

  /**
   * Shutdown the watch service
   */
  async shutdown(): Promise<void> {
    this.serviceLogger.info("Shutting down watch service");

    if (this.configPollInterval) {
      clearInterval(this.configPollInterval);
      this.configPollInterval = null;
    }

    if (this.eventProcessInterval) {
      clearInterval(this.eventProcessInterval);
      this.eventProcessInterval = null;
    }

    await fileWatcher.stopAll();
  }
}

// Export singleton
export const watchService = new WatchService();
