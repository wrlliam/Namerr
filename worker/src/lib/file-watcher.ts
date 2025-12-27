/**
 * FileWatcher - Monitor library directories for new files
 * Uses chokidar for cross-platform file watching with debouncing
 */

import chokidar, { FSWatcher } from "chokidar";
import * as path from "path";
import * as fs from "fs/promises";
import { db } from "./db";
import { watchEvents, mediaLibraries } from "../../../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// Video file extensions to watch for
const VIDEO_EXTENSIONS = new Set([
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".m4v",
  ".wmv",
  ".flv",
  ".webm",
  ".mpg",
  ".mpeg",
  ".ts",
  ".m2ts",
]);

interface WatcherEntry {
  watcher: FSWatcher;
  libraryId: string;
  libraryPath: string;
  debounceMs: number;
  pendingEvents: Map<string, NodeJS.Timeout>;
}

export class FileWatcher {
  private watchers: Map<string, WatcherEntry> = new Map();
  private watchLogger = logger.child({ component: "FileWatcher" });

  /**
   * Start watching a library for file changes
   */
  async startWatching(library: {
    id: string;
    path: string;
    type: string;
    watchDebounceMs?: number | null;
  }): Promise<void> {
    // Stop existing watcher if any
    await this.stopWatching(library.id);

    const debounceMs = library.watchDebounceMs || 30000; // Default 30 seconds
    const depth = library.type === "tv" ? 3 : 2;

    this.watchLogger.info(`Starting watch for library ${library.id}`, {
      path: library.path,
      debounceMs,
      depth,
    });

    try {
      // Verify path exists
      await fs.access(library.path);

      const watcher = chokidar.watch(library.path, {
        ignored: [
          /(^|[\/\\])\../, // Dotfiles
          "**/Sample/**",
          "**/sample/**",
          "**/Extras/**",
          "**/extras/**",
          "**/@eaDir/**",
          "**/#recycle/**",
        ],
        persistent: true,
        ignoreInitial: true, // Don't trigger on existing files
        depth: depth,
        awaitWriteFinish: {
          stabilityThreshold: 5000, // Wait 5 seconds after last change
          pollInterval: 1000,
        },
      });

      const entry: WatcherEntry = {
        watcher,
        libraryId: library.id,
        libraryPath: library.path,
        debounceMs,
        pendingEvents: new Map(),
      };

      // Handle file add events
      watcher.on("add", (filePath) => {
        this.handleFileEvent(entry, "add", filePath);
      });

      // Handle file change events
      watcher.on("change", (filePath) => {
        this.handleFileEvent(entry, "change", filePath);
      });

      // Handle file remove events
      watcher.on("unlink", (filePath) => {
        this.handleFileEvent(entry, "unlink", filePath);
      });

      // Handle errors
      watcher.on("error", (error: unknown) => {
        this.watchLogger.error(`Watcher error for library ${library.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      });

      // Handle ready
      watcher.on("ready", () => {
        this.watchLogger.info(`Watcher ready for library ${library.id}`);
      });

      this.watchers.set(library.id, entry);
    } catch (error) {
      this.watchLogger.error(`Failed to start watcher for library ${library.id}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Handle file system events with debouncing
   */
  private handleFileEvent(
    entry: WatcherEntry,
    eventType: "add" | "change" | "unlink",
    filePath: string
  ): void {
    // Only process video files
    const ext = path.extname(filePath).toLowerCase();
    if (!VIDEO_EXTENSIONS.has(ext)) {
      return;
    }

    this.watchLogger.debug(`File event: ${eventType} ${filePath}`);

    // Clear any pending event for this file
    const existingTimeout = entry.pendingEvents.get(filePath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set debounced event
    const timeout = setTimeout(async () => {
      entry.pendingEvents.delete(filePath);
      await this.recordEvent(entry.libraryId, eventType, filePath);
    }, entry.debounceMs);

    entry.pendingEvents.set(filePath, timeout);
  }

  /**
   * Record a file event to the database
   */
  private async recordEvent(
    libraryId: string,
    eventType: "add" | "change" | "unlink",
    filePath: string
  ): Promise<void> {
    try {
      // Verify file still exists (for add/change events)
      if (eventType !== "unlink") {
        const isComplete = await this.isFileComplete(filePath);
        if (!isComplete) {
          this.watchLogger.debug(`File not complete yet, skipping: ${filePath}`);
          return;
        }
      }

      await db.insert(watchEvents).values({
        libraryId,
        eventType,
        filePath,
        status: "pending",
      });

      this.watchLogger.info(`Recorded watch event: ${eventType} ${path.basename(filePath)}`);
    } catch (error) {
      this.watchLogger.error(`Failed to record watch event`, {
        error: error instanceof Error ? error.message : String(error),
        filePath,
      });
    }
  }

  /**
   * Check if a file is complete (not being written to)
   */
  private async isFileComplete(filePath: string): Promise<boolean> {
    try {
      const stats1 = await fs.stat(filePath);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
      const stats2 = await fs.stat(filePath);

      // If size hasn't changed, file is likely complete
      return stats1.size === stats2.size;
    } catch {
      return false;
    }
  }

  /**
   * Stop watching a library
   */
  async stopWatching(libraryId: string): Promise<void> {
    const entry = this.watchers.get(libraryId);
    if (!entry) {
      return;
    }

    this.watchLogger.info(`Stopping watch for library ${libraryId}`);

    // Clear all pending timeouts
    for (const timeout of entry.pendingEvents.values()) {
      clearTimeout(timeout);
    }

    // Close watcher
    await entry.watcher.close();

    this.watchers.delete(libraryId);
  }

  /**
   * Stop all watchers
   */
  async stopAll(): Promise<void> {
    const libraryIds = Array.from(this.watchers.keys());
    for (const libraryId of libraryIds) {
      await this.stopWatching(libraryId);
    }
  }

  /**
   * Get list of active watchers
   */
  getActiveWatchers(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * Check if a library is being watched
   */
  isWatching(libraryId: string): boolean {
    return this.watchers.has(libraryId);
  }
}

// Export singleton
export const fileWatcher = new FileWatcher();
