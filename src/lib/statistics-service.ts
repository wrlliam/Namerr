/**
 * StatisticsService - Calculate and cache library statistics
 */

import { db } from "@/src/lib/db";
import {
  libraryStatistics,
  activityLog,
  mediaFiles,
  mediaLibraries,
  renameHistory,
  LibraryStatistic,
  ActivityLogEntry,
} from "@/src/lib/db/schema";
import { eq, and, sql, desc, count, avg, sum, gte } from "drizzle-orm";

export interface GlobalStatistics {
  totalLibraries: number;
  totalFiles: number;
  totalSizeBytes: number;
  filesByStatus: {
    pending: number;
    ready: number;
    renamed: number;
    error: number;
    skipped: number;
  };
  verifiedFiles: number;
  unverifiedFiles: number;
  avgMatchScore: number | null;
  recentRenames: number; // Last 24 hours
}

export interface LibraryStats extends LibraryStatistic {
  library?: {
    id: string;
    label: string;
    type: string;
  };
}

export interface Activity {
  id: string;
  libraryId: string | null;
  userId: string | null;
  activityType: string;
  description: string;
  metadata: any;
  createdAt: Date;
  library?: {
    id: string;
    label: string;
  } | null;
}

export class StatisticsService {
  /**
   * Update statistics for a specific library
   */
  async updateLibraryStats(libraryId: string): Promise<LibraryStatistic | null> {
    // Get aggregated stats from media files
    const [stats] = await db
      .select({
        totalFiles: count(),
        totalSizeBytes: sum(mediaFiles.fileSize),
        avgMatchScore: avg(mediaFiles.seerrMatchScore),
      })
      .from(mediaFiles)
      .where(eq(mediaFiles.libraryId, libraryId));

    // Get status counts
    const statusCounts = await db
      .select({
        status: mediaFiles.renameStatus,
        count: count(),
      })
      .from(mediaFiles)
      .where(eq(mediaFiles.libraryId, libraryId))
      .groupBy(mediaFiles.renameStatus);

    const statusMap: Record<string, number> = {
      pending: 0,
      ready: 0,
      renamed: 0,
      error: 0,
      skipped: 0,
    };
    for (const { status, count } of statusCounts) {
      if (status) statusMap[status] = Number(count);
    }

    // Get verification counts
    const [verifiedStats] = await db
      .select({
        verified: count(sql`CASE WHEN ${mediaFiles.seerrVerified} = true THEN 1 END`),
        unverified: count(sql`CASE WHEN ${mediaFiles.seerrVerified} = false OR ${mediaFiles.seerrVerified} IS NULL THEN 1 END`),
      })
      .from(mediaFiles)
      .where(eq(mediaFiles.libraryId, libraryId));

    // Get confidence counts (match score > 0.8 = high, < 0.8 = low)
    const [confidenceCounts] = await db
      .select({
        highConfidence: count(sql`CASE WHEN CAST(${mediaFiles.seerrMatchScore} AS DECIMAL) >= 0.8 THEN 1 END`),
        lowConfidence: count(sql`CASE WHEN CAST(${mediaFiles.seerrMatchScore} AS DECIMAL) < 0.8 AND ${mediaFiles.seerrMatchScore} IS NOT NULL THEN 1 END`),
      })
      .from(mediaFiles)
      .where(eq(mediaFiles.libraryId, libraryId));

    // Check if stats record exists
    const [existing] = await db
      .select()
      .from(libraryStatistics)
      .where(eq(libraryStatistics.libraryId, libraryId))
      .limit(1);

    const statsData = {
      totalFiles: Number(stats?.totalFiles || 0),
      pendingFiles: statusMap.pending,
      readyFiles: statusMap.ready,
      renamedFiles: statusMap.renamed,
      errorFiles: statusMap.error,
      skippedFiles: statusMap.skipped,
      verifiedFiles: Number(verifiedStats?.verified || 0),
      unverifiedFiles: Number(verifiedStats?.unverified || 0),
      totalSizeBytes: Number(stats?.totalSizeBytes || 0),
      avgMatchScore: stats?.avgMatchScore?.toString() || null,
      highConfidenceMatches: Number(confidenceCounts?.highConfidence || 0),
      lowConfidenceMatches: Number(confidenceCounts?.lowConfidence || 0),
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(libraryStatistics)
        .set(statsData)
        .where(eq(libraryStatistics.id, existing.id));

      return { ...existing, ...statsData };
    } else {
      const [newStats] = await db
        .insert(libraryStatistics)
        .values({
          libraryId,
          ...statsData,
        })
        .returning();

      return newStats;
    }
  }

  /**
   * Get statistics for a specific library
   */
  async getLibraryStats(libraryId: string): Promise<LibraryStats | null> {
    const [stats] = await db
      .select({
        stats: libraryStatistics,
        library: {
          id: mediaLibraries.id,
          label: mediaLibraries.label,
          type: mediaLibraries.type,
        },
      })
      .from(libraryStatistics)
      .leftJoin(mediaLibraries, eq(libraryStatistics.libraryId, mediaLibraries.id))
      .where(eq(libraryStatistics.libraryId, libraryId))
      .limit(1);

    if (!stats) {
      // Generate stats on-demand
      const generated = await this.updateLibraryStats(libraryId);
      if (generated) {
        const [library] = await db
          .select({ id: mediaLibraries.id, label: mediaLibraries.label, type: mediaLibraries.type })
          .from(mediaLibraries)
          .where(eq(mediaLibraries.id, libraryId))
          .limit(1);

        return { ...generated, library: library || undefined };
      }
      return null;
    }

    return { ...stats.stats, library: stats.library || undefined };
  }

  /**
   * Get global statistics across all libraries
   */
  async getGlobalStats(): Promise<GlobalStatistics> {
    // Count libraries
    const [libraryCount] = await db
      .select({ count: count() })
      .from(mediaLibraries);

    // Get file aggregates
    const [fileStats] = await db
      .select({
        totalFiles: count(),
        totalSizeBytes: sum(mediaFiles.fileSize),
        avgMatchScore: avg(mediaFiles.seerrMatchScore),
      })
      .from(mediaFiles);

    // Get status counts
    const statusCounts = await db
      .select({
        status: mediaFiles.renameStatus,
        count: count(),
      })
      .from(mediaFiles)
      .groupBy(mediaFiles.renameStatus);

    const statusMap: Record<string, number> = {
      pending: 0,
      ready: 0,
      renamed: 0,
      error: 0,
      skipped: 0,
    };
    for (const { status, count } of statusCounts) {
      if (status) statusMap[status] = Number(count);
    }

    // Get verification counts
    const [verifiedStats] = await db
      .select({
        verified: count(sql`CASE WHEN ${mediaFiles.seerrVerified} = true THEN 1 END`),
        unverified: count(sql`CASE WHEN ${mediaFiles.seerrVerified} = false OR ${mediaFiles.seerrVerified} IS NULL THEN 1 END`),
      })
      .from(mediaFiles);

    // Get recent renames (last 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const [recentRenames] = await db
      .select({ count: count() })
      .from(renameHistory)
      .where(
        and(
          eq(renameHistory.status, "active"),
          gte(renameHistory.createdAt, oneDayAgo)
        )
      );

    return {
      totalLibraries: Number(libraryCount?.count || 0),
      totalFiles: Number(fileStats?.totalFiles || 0),
      totalSizeBytes: Number(fileStats?.totalSizeBytes || 0),
      filesByStatus: {
        pending: statusMap.pending,
        ready: statusMap.ready,
        renamed: statusMap.renamed,
        error: statusMap.error,
        skipped: statusMap.skipped,
      },
      verifiedFiles: Number(verifiedStats?.verified || 0),
      unverifiedFiles: Number(verifiedStats?.unverified || 0),
      avgMatchScore: fileStats?.avgMatchScore ? Number(fileStats.avgMatchScore) : null,
      recentRenames: Number(recentRenames?.count || 0),
    };
  }

  /**
   * Log an activity
   */
  async logActivity(options: {
    libraryId?: string;
    userId?: string;
    activityType: string;
    description: string;
    metadata?: any;
  }): Promise<void> {
    await db.insert(activityLog).values({
      libraryId: options.libraryId,
      userId: options.userId,
      activityType: options.activityType,
      description: options.description,
      metadata: options.metadata,
    });
  }

  /**
   * Get recent activity
   */
  async getRecentActivity(options: {
    limit?: number;
    libraryId?: string;
  } = {}): Promise<Activity[]> {
    const { limit = 50, libraryId } = options;

    const conditions = libraryId ? [eq(activityLog.libraryId, libraryId)] : [];

    const activities = await db
      .select({
        activity: activityLog,
        library: {
          id: mediaLibraries.id,
          label: mediaLibraries.label,
        },
      })
      .from(activityLog)
      .leftJoin(mediaLibraries, eq(activityLog.libraryId, mediaLibraries.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);

    return activities.map((a) => ({
      ...a.activity,
      library: a.library,
    }));
  }

  /**
   * Update all library statistics
   */
  async updateAllStats(): Promise<void> {
    const libraries = await db.select({ id: mediaLibraries.id }).from(mediaLibraries);

    for (const library of libraries) {
      await this.updateLibraryStats(library.id);
    }
  }
}

// Export singleton
export const statisticsService = new StatisticsService();
