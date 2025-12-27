/**
 * RenameHistoryService - Track and undo rename operations
 */

import { db } from "@/src/lib/db";
import {
  renameHistory,
  mediaFiles,
  mediaLibraries,
  RenameHistory,
  NewRenameHistory,
} from "@/src/lib/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import * as fs from "fs/promises";
import * as path from "path";

export interface AssociatedFile {
  oldPath: string;
  newPath: string;
}

export interface RecordRenameOptions {
  mediaFileId?: string;
  libraryId: string;
  jobId?: string;
  oldPath: string;
  newPath: string;
  operationType: "rename" | "move" | "organize";
  associatedFiles?: AssociatedFile[];
}

export interface RenameHistoryEntry extends RenameHistory {
  mediaFile?: {
    id: string;
    fileName: string;
    seerrTitle?: string | null;
  } | null;
  library?: {
    id: string;
    label: string;
    path: string;
  } | null;
}

export interface UndoResult {
  success: boolean;
  error?: string;
  filesRestored?: number;
}

export interface CanUndoResult {
  possible: boolean;
  reason?: string;
}

export class RenameHistoryService {
  /**
   * Record a rename operation
   */
  async recordRename(options: RecordRenameOptions): Promise<RenameHistory> {
    const oldFileName = path.basename(options.oldPath);
    const newFileName = path.basename(options.newPath);

    const [entry] = await db
      .insert(renameHistory)
      .values({
        mediaFileId: options.mediaFileId,
        libraryId: options.libraryId,
        jobId: options.jobId,
        oldPath: options.oldPath,
        newPath: options.newPath,
        oldFileName,
        newFileName,
        operationType: options.operationType,
        associatedFiles: options.associatedFiles || [],
        status: "active",
      })
      .returning();

    console.log(
      `[RenameHistory] Recorded ${options.operationType}: ${oldFileName} -> ${newFileName}`
    );

    return entry;
  }

  /**
   * Get history for a specific media file
   */
  async getFileHistory(mediaFileId: string): Promise<RenameHistoryEntry[]> {
    const entries = await db
      .select({
        history: renameHistory,
        library: {
          id: mediaLibraries.id,
          label: mediaLibraries.label,
          path: mediaLibraries.path,
        },
      })
      .from(renameHistory)
      .leftJoin(mediaLibraries, eq(renameHistory.libraryId, mediaLibraries.id))
      .where(eq(renameHistory.mediaFileId, mediaFileId))
      .orderBy(desc(renameHistory.createdAt));

    return entries.map((e) => ({
      ...e.history,
      library: e.library,
    }));
  }

  /**
   * Get history for a library with pagination
   */
  async getLibraryHistory(
    libraryId: string,
    options: { limit?: number; offset?: number; status?: "active" | "undone" } = {}
  ): Promise<{ entries: RenameHistoryEntry[]; total: number }> {
    const { limit = 50, offset = 0, status } = options;

    const conditions = [eq(renameHistory.libraryId, libraryId)];
    if (status) {
      conditions.push(eq(renameHistory.status, status));
    }

    const whereClause = and(...conditions);

    const entries = await db
      .select({
        history: renameHistory,
        mediaFile: {
          id: mediaFiles.id,
          fileName: mediaFiles.fileName,
          seerrTitle: mediaFiles.seerrTitle,
        },
      })
      .from(renameHistory)
      .leftJoin(mediaFiles, eq(renameHistory.mediaFileId, mediaFiles.id))
      .where(whereClause)
      .orderBy(desc(renameHistory.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(renameHistory)
      .where(whereClause);

    return {
      entries: entries.map((e) => ({
        ...e.history,
        mediaFile: e.mediaFile,
      })),
      total: Number(countResult?.count || 0),
    };
  }

  /**
   * Get all recent history across all libraries
   */
  async getRecentHistory(
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ entries: RenameHistoryEntry[]; total: number }> {
    const { limit = 50, offset = 0 } = options;

    const entries = await db
      .select({
        history: renameHistory,
        mediaFile: {
          id: mediaFiles.id,
          fileName: mediaFiles.fileName,
          seerrTitle: mediaFiles.seerrTitle,
        },
        library: {
          id: mediaLibraries.id,
          label: mediaLibraries.label,
          path: mediaLibraries.path,
        },
      })
      .from(renameHistory)
      .leftJoin(mediaFiles, eq(renameHistory.mediaFileId, mediaFiles.id))
      .leftJoin(mediaLibraries, eq(renameHistory.libraryId, mediaLibraries.id))
      .orderBy(desc(renameHistory.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(renameHistory);

    return {
      entries: entries.map((e) => ({
        ...e.history,
        mediaFile: e.mediaFile,
        library: e.library,
      })),
      total: Number(countResult?.count || 0),
    };
  }

  /**
   * Check if an undo operation is possible
   */
  async canUndo(historyId: string): Promise<CanUndoResult> {
    const [entry] = await db
      .select()
      .from(renameHistory)
      .where(eq(renameHistory.id, historyId))
      .limit(1);

    if (!entry) {
      return { possible: false, reason: "History entry not found" };
    }

    if (entry.status === "undone") {
      return { possible: false, reason: "Already undone" };
    }

    // Check if the current file exists
    try {
      await fs.access(entry.newPath);
    } catch {
      return {
        possible: false,
        reason: "Current file not found at expected path",
      };
    }

    // Check if the original path is available
    try {
      await fs.access(entry.oldPath);
      return {
        possible: false,
        reason: "Original path is already occupied by another file",
      };
    } catch {
      // Original path is free, which is what we want
    }

    // Check associated files
    const associatedFiles = (entry.associatedFiles as AssociatedFile[]) || [];
    for (const assoc of associatedFiles) {
      try {
        await fs.access(assoc.newPath);
      } catch {
        // Associated file missing - just warn, don't block undo
        console.warn(
          `[RenameHistory] Associated file missing: ${assoc.newPath}`
        );
      }
    }

    return { possible: true };
  }

  /**
   * Undo a rename operation
   */
  async undoRename(historyId: string, userId?: string): Promise<UndoResult> {
    const canUndoResult = await this.canUndo(historyId);
    if (!canUndoResult.possible) {
      return { success: false, error: canUndoResult.reason };
    }

    const [entry] = await db
      .select()
      .from(renameHistory)
      .where(eq(renameHistory.id, historyId))
      .limit(1);

    if (!entry) {
      return { success: false, error: "History entry not found" };
    }

    let filesRestored = 0;

    try {
      // Ensure original directory exists
      const originalDir = path.dirname(entry.oldPath);
      await fs.mkdir(originalDir, { recursive: true });

      // Move the main file back
      await fs.rename(entry.newPath, entry.oldPath);
      filesRestored++;
      console.log(
        `[RenameHistory] Restored: ${path.basename(entry.newPath)} -> ${path.basename(entry.oldPath)}`
      );

      // Move associated files back
      const associatedFiles = (entry.associatedFiles as AssociatedFile[]) || [];
      for (const assoc of associatedFiles) {
        try {
          await fs.access(assoc.newPath);
          await fs.rename(assoc.newPath, assoc.oldPath);
          filesRestored++;
          console.log(
            `[RenameHistory] Restored associated: ${path.basename(assoc.newPath)}`
          );
        } catch {
          // Associated file missing, skip it
          console.warn(
            `[RenameHistory] Could not restore associated file: ${assoc.newPath}`
          );
        }
      }

      // Update history entry
      await db
        .update(renameHistory)
        .set({
          status: "undone",
          undoneAt: new Date(),
          undoneBy: userId,
        })
        .where(eq(renameHistory.id, historyId));

      // Update media file record if we have one
      if (entry.mediaFileId) {
        const [library] = await db
          .select({ path: mediaLibraries.path })
          .from(mediaLibraries)
          .where(eq(mediaLibraries.id, entry.libraryId))
          .limit(1);

        if (library) {
          await db
            .update(mediaFiles)
            .set({
              filePath: path.relative(library.path, entry.oldPath),
              fileName: path.basename(entry.oldPath),
              renameStatus: "pending",
              lastRenamedAt: null,
            })
            .where(eq(mediaFiles.id, entry.mediaFileId));
        }
      }

      return { success: true, filesRestored };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[RenameHistory] Undo failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Clean up old history entries (optional)
   */
  async cleanupOldEntries(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await db
      .delete(renameHistory)
      .where(
        and(
          eq(renameHistory.status, "undone"),
          sql`${renameHistory.createdAt} < ${cutoffDate}`
        )
      );

    // Drizzle doesn't directly return count, but we can log it
    console.log(`[RenameHistory] Cleaned up old entries older than ${daysToKeep} days`);
    return 0; // Would need to use returning() or raw query to get count
  }
}

// Export singleton instance
export const renameHistoryService = new RenameHistoryService();
