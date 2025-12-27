/**
 * Queue processor with parallel execution
 * Processes media file renaming jobs
 */

import { eq, and } from "drizzle-orm";
import { db } from "./lib/db";
import {
  workerJobs,
  workerJobLogs,
  mediaFiles,
  mediaLibraries,
  systemConfig,
  seerrSettings,
} from "../../src/lib/db/schema";
import { logger } from "./lib/logger";
import { scanLibraryPath } from "../../src/lib/file-scanner";
import { PatternCleaner } from "../../src/lib/pattern-cleaner";
import { MediaParser } from "../../src/lib/media-parser";
import { FileRenamer } from "../../src/lib/file-renamer";
import { SeerrClient } from "../../src/lib/seerr-client";
import { TVOrganizer } from "../../src/lib/tv-organizer";
import { renameHistoryService } from "../../src/lib/rename-history";
import { WorkerHeartbeat } from "./lib/heartbeat";
import * as path from "path";

interface ProcessingContext {
  jobId: string;
  dryRun: boolean;
  parallelism: number;
  cleaner: PatternCleaner;
  parser: MediaParser;
  renamer: FileRenamer;
  tvOrganizer: TVOrganizer;
  seerrClient?: SeerrClient;
}

export class QueueProcessor {
  private isProcessing = false;
  private heartbeat: WorkerHeartbeat | null = null;

  constructor(heartbeat?: WorkerHeartbeat) {
    this.heartbeat = heartbeat || null;
  }

  /**
   * Get system configuration
   */
  private async getSystemConfig(): Promise<{
    dryRun: boolean;
    parallelism: number;
  }> {
    const configs = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "worker_parallelism"));

    const dryRunConfigs = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "dry_run_mode"));

    const parallelism =
      configs.length > 0 && configs[0].value
        ? Number(
            (configs[0].value as { parallelism?: number }).parallelism || 4
          )
        : 4;

    const dryRun =
      dryRunConfigs.length > 0 && dryRunConfigs[0].value
        ? Boolean((dryRunConfigs[0].value as { enabled?: boolean }).enabled)
        : true;

    return { dryRun, parallelism };
  }

  /**
   * Process items in parallel batches
   */
  private async processInParallel<T>(
    items: T[],
    parallelism: number,
    handler: (item: T) => Promise<void>
  ): Promise<void> {
    for (let i = 0; i < items.length; i += parallelism) {
      const batch = items.slice(i, i + parallelism);
      await Promise.all(batch.map(handler));
    }
  }

  /**
   * Process a single media file
   */
  private async processMediaFile(
    file: typeof mediaFiles.$inferSelect,
    library: typeof mediaLibraries.$inferSelect,
    context: ProcessingContext
  ): Promise<void> {
    const startTime = Date.now();
    const jobLogger = logger.child({
      jobId: context.jobId,
      fileId: file.id,
      fileName: file.fileName,
    });

    try {
      // Skip if already renamed
      if (file.renameStatus === "renamed") {
        jobLogger.info("File already renamed, skipping");
        return;
      }

      const filePath = path.join(library.path, file.filePath);

      // Parse filename if not already parsed
      let mediaInfo: {
        title: string;
        year?: string;
        season?: number;
        episode?: number;
      } = {
        title: file.parsedTitle || "",
        ...(file.parsedYear && { year: file.parsedYear }),
        ...(file.parsedSeason && { season: file.parsedSeason }),
        ...(file.parsedEpisode && { episode: file.parsedEpisode }),
      };

      if (!file.parsedTitle) {
        const filename = path.basename(
          file.fileName,
          path.extname(file.fileName)
        );
        if (library.type === "movie") {
          mediaInfo = context.parser.extractMovieInfo(filename);
        } else {
          mediaInfo = context.parser.extractTVInfo(filename);
        }
      }

      // Verify with Seerr if available
      if (context.seerrClient && !file.seerrVerified) {
        // Prefer deriving title from folder/file name rather than existing metadata
        const { PatternCleaner } = await import(
          "../../src/lib/pattern-cleaner"
        );
        const cleaner = new PatternCleaner();
        const filenameBase =
          file.fileName || path.basename(file.filePath || "");
        const folderName = path.basename(path.dirname(file.filePath || ""));
        const searchTitleRaw =
          library.type === "tv" && folderName
            ? folderName
            : filenameBase.replace(path.extname(filenameBase), "");
        const searchTitle = cleaner.cleanForSearch(searchTitleRaw);

        if (library.type === "movie") {
          const result = await context.seerrClient.verifyMovie(
            searchTitle || mediaInfo.title,
            mediaInfo.year,
            0.8,
            false,
            file.fileName
          );
          if (result.verified && result.data) {
            mediaInfo.title = result.data.title;
            mediaInfo.year = result.data.release_date?.substring(0, 4);

            // Update database with Seerr metadata
            await db
              .update(mediaFiles)
              .set({
                seerrVerified: true,
                seerrTitle: result.data.title,
                seerrYear: result.data.release_date?.substring(0, 4),
                seerrTmdbId: result.data.id,
                seerrOverview: result.data.overview,
                seerrPosterPath: result.data.poster_path,
                seerrMatchScore: result.data.match_score?.toString(),
              })
              .where(eq(mediaFiles.id, file.id));
          }
        } else {
          const result = await context.seerrClient.verifyTV(
            searchTitle || mediaInfo.title,
            0.8,
            false,
            file.fileName
          );
          if (result.verified && result.data) {
            mediaInfo.title = result.data.name;

            // Fetch season name if we have season info
            let seasonName: string | undefined;
            let episodeName: string | undefined;
            if (mediaInfo.season && result.data.id) {
              const seasonDetails = await context.seerrClient.getTVSeasonDetails(
                result.data.id,
                mediaInfo.season
              );
              if (seasonDetails) {
                seasonName = seasonDetails.name;
                if (mediaInfo.episode) {
                  const episode = seasonDetails.episodes.find(
                    (ep) => ep.episodeNumber === mediaInfo.episode
                  );
                  episodeName = episode?.name;
                }
              }
            }

            await db
              .update(mediaFiles)
              .set({
                seerrVerified: true,
                seerrTitle: result.data.name,
                seerrYear: result.data.first_air_date?.substring(0, 4),
                seerrTmdbId: result.data.id,
                seerrOverview: result.data.overview,
                seerrPosterPath: result.data.poster_path,
                seerrMatchScore: result.data.match_score?.toString(),
                seerrSeasonName: seasonName,
                seerrEpisodeName: episodeName,
              })
              .where(eq(mediaFiles.id, file.id));

            // Store season name for later use in organization
            (file as any)._seasonName = seasonName;
          }
        }
      }

      // Prefer manual > seerr > parsed
      const finalTitle = file.manualTitle || file.seerrTitle || mediaInfo.title;
      const finalYear = file.manualYear || file.seerrYear || mediaInfo.year;
      const finalSeason = file.manualSeason || mediaInfo.season;
      const finalEpisode = file.manualEpisode || mediaInfo.episode;

      // Perform rename
      let result;
      if (library.type === "movie") {
        result = await context.renamer.renameMovie(
          filePath,
          { title: finalTitle, year: finalYear },
          { dryRun: context.dryRun }
        );
      } else {
        // For TV shows, calculate the target directory (Show/Season folder)
        let targetDirectory: string | undefined;
        if (finalSeason) {
          const seasonName = (file as any)._seasonName || file.seerrSeasonName;
          const { seasonFolder } = await context.tvOrganizer.ensureFolderStructure(
            library.path,
            finalTitle,
            finalSeason,
            seasonName
          );
          targetDirectory = seasonFolder;
        }

        result = await context.renamer.renameTV(
          filePath,
          {
            title: finalTitle,
            season: finalSeason,
            episode: finalEpisode,
          },
          { dryRun: context.dryRun, targetDirectory }
        );
      }

      const executionTime = Date.now() - startTime;

      if (result.success) {
        if (result.skipped) {
          jobLogger.info("File skipped (already correct or conflict)");

          if (this.heartbeat) {
            this.heartbeat.incrementFileCount("skipped");
          }

          await db.insert(workerJobLogs).values({
            jobId: context.jobId,
            mediaFileId: file.id,
            operation: "rename",
            status: "skipped",
            oldPath: result.oldPath,
            newPath: result.newPath,
            executionTimeMs: executionTime,
          });
        } else {
          jobLogger.info(`Renamed: ${path.basename(result.oldPath || "")} -> ${path.basename(result.newPath || "")}`);

          if (this.heartbeat) {
            this.heartbeat.incrementFileCount("success");
          }

          // Update media file
          if (!context.dryRun && result.newPath) {
            await db
              .update(mediaFiles)
              .set({
                filePath: path.relative(library.path, result.newPath),
                fileName: path.basename(result.newPath),
                renameStatus: "renamed",
                lastRenamedAt: new Date(),
              })
              .where(eq(mediaFiles.id, file.id));

            // Record rename history for undo functionality
            try {
              await renameHistoryService.recordRename({
                mediaFileId: file.id,
                libraryId: library.id,
                jobId: context.jobId,
                oldPath: result.oldPath!,
                newPath: result.newPath,
                operationType: library.type === "tv" ? "organize" : "rename",
              });
            } catch (historyError) {
              jobLogger.warn("Failed to record rename history", { historyError });
            }
          }

          await db.insert(workerJobLogs).values({
            jobId: context.jobId,
            mediaFileId: file.id,
            operation: "rename",
            status: "success",
            oldPath: result.oldPath,
            newPath: result.newPath,
            executionTimeMs: executionTime,
          });
        }
      } else {
        jobLogger.error(`Rename failed: ${result.error}`);

        if (this.heartbeat) {
          this.heartbeat.incrementFileCount("error");
        }

        await db
          .update(mediaFiles)
          .set({
            renameStatus: "error",
            renameError: result.error,
          })
          .where(eq(mediaFiles.id, file.id));

        await db.insert(workerJobLogs).values({
          jobId: context.jobId,
          mediaFileId: file.id,
          operation: "rename",
          status: "error",
          oldPath: result.oldPath,
          errorMessage: result.error,
          executionTimeMs: executionTime,
        });
      }
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      jobLogger.error("Unexpected error processing file", {
        error: errorMessage,
      });

      await db
        .update(mediaFiles)
        .set({
          renameStatus: "error",
          renameError: errorMessage,
        })
        .where(eq(mediaFiles.id, file.id));

      await db.insert(workerJobLogs).values({
        jobId: context.jobId,
        mediaFileId: file.id,
        operation: "rename",
        status: "error",
        errorMessage,
        executionTimeMs: executionTime,
      });
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: typeof workerJobs.$inferSelect): Promise<void> {
    const jobLogger = logger.child({ jobId: job.id });
    jobLogger.info(`Starting ${job.type} job for library ${job.libraryId}`);

    try {
      // Set current job in heartbeat
      if (this.heartbeat) {
        this.heartbeat.setCurrentJob(job.id, 0);
        this.heartbeat.resetFileCounters();
      }

      // Update job status to running
      await db
        .update(workerJobs)
        .set({
          status: "running",
          startedAt: new Date(),
        })
        .where(eq(workerJobs.id, job.id));

      // Get system config
      const config = await this.getSystemConfig();

      // Get library
      const [library] = await db
        .select()
        .from(mediaLibraries)
        .where(eq(mediaLibraries.id, job.libraryId!))
        .limit(1);

      if (!library) {
        throw new Error("Library not found");
      }

      // Initialize components
      const cleaner = new PatternCleaner();
      const parser = new MediaParser(cleaner);
      const renamer = new FileRenamer({
        conflictResolution: "skip",
        handleSubtitles: true,
      });
      const tvOrganizer = new TVOrganizer();

      // Get Seerr client if configured
      let seerrClient: SeerrClient | undefined;
      const [seerrConfig] = await db
        .select()
        .from(seerrSettings)
        .orderBy(seerrSettings.id)
        .limit(1);

      if (seerrConfig?.apiUrl && seerrConfig?.apiKey) {
        seerrClient = new SeerrClient(seerrConfig.apiKey, seerrConfig.apiUrl);
      }

      const context: ProcessingContext = {
        jobId: job.id,
        dryRun: config.dryRun,
        parallelism: config.parallelism,
        cleaner,
        parser,
        renamer,
        tvOrganizer,
        seerrClient,
      };

      // Get media files that need renaming
      const files = await db
        .select()
        .from(mediaFiles)
        .where(
          and(
            eq(mediaFiles.libraryId, job.libraryId!),
            eq(mediaFiles.renameStatus, "ready")
          )
        );

      jobLogger.info(`Found ${files.length} files to process`);

      // Update job with total items
      await db
        .update(workerJobs)
        .set({
          totalItems: files.length,
        })
        .where(eq(workerJobs.id, job.id));

      // Process files in parallel
      let processedCount = 0;
      await this.processInParallel(files, context.parallelism, async (file) => {
        await this.processMediaFile(file, library, context);
        processedCount++;

        const progress = Math.floor((processedCount / files.length) * 100);

        // Update heartbeat with current progress
        if (this.heartbeat) {
          this.heartbeat.setCurrentJob(job.id, progress);
        }

        // Update progress
        await db
          .update(workerJobs)
          .set({
            processedItems: processedCount,
            progress,
          })
          .where(eq(workerJobs.id, job.id));
      });

      // Mark job as completed
      await db
        .update(workerJobs)
        .set({
          status: "completed",
          completedAt: new Date(),
          progress: 100,
        })
        .where(eq(workerJobs.id, job.id));

      // Clear current job in heartbeat
      if (this.heartbeat) {
        this.heartbeat.setCurrentJob(null);
      }

      jobLogger.info(`Completed: processed ${files.length} files`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      jobLogger.error(`Failed: ${errorMessage}`);

      await db
        .update(workerJobs)
        .set({
          status: "failed",
          completedAt: new Date(),
        })
        .where(eq(workerJobs.id, job.id));
    }
  }

  /**
   * Process all pending jobs
   */
  async processPendingJobs(): Promise<void> {
    if (this.isProcessing) {
      logger.warn("Queue processor already running, skipping");
      return;
    }

    this.isProcessing = true;
    logger.info("Starting queue processor");

    try {
      // Get pending jobs
      const pendingJobs = await db
        .select()
        .from(workerJobs)
        .where(eq(workerJobs.status, "queued"))
        .orderBy(workerJobs.createdAt);

      logger.info(`Found ${pendingJobs.length} pending jobs`);

      // Process jobs sequentially
      for (const job of pendingJobs) {
        await this.processJob(job);
      }

      logger.info("Queue processor finished");
    } catch (error) {
      logger.error("Queue processor error", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isProcessing = false;
    }
  }
}
