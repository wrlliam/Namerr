import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaLibraries, mediaFiles, subtitleFiles, librarySettings } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { scanLibraryPath, findAssociatedSubtitles } from "@/src/lib/file-scanner";
import { loadMetadataFile, getPosterPath, getBackdropPath } from "@/src/lib/metadata-file";
import { parseTVShowPath } from "@/src/lib/tv-parser";
import { fetchMetadataForFile } from "@/src/lib/metadata-fetcher";
import * as fs from "fs/promises";
import path from "path";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/libraries/[id]/scan - Trigger a library scan
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const isAdmin = session.user.role === "admin";

    // Check library exists and user has access
    const conditions = [eq(mediaLibraries.id, id)];
    if (!isAdmin) {
      conditions.push(eq(mediaLibraries.userId, session.user.id));
    }

    const [library] = await db
      .select()
      .from(mediaLibraries)
      .where(and(...conditions))
      .limit(1);

    if (!library) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }

    // Fetch library settings for auto-metadata
    let [libSettings] = await db
      .select()
      .from(librarySettings)
      .where(eq(librarySettings.libraryId, id))
      .limit(1);

    // Create default settings if they don't exist
    if (!libSettings) {
      [libSettings] = await db
        .insert(librarySettings)
        .values({
          libraryId: id,
          autoMetadataOnScan: true,
          matchConfidenceThreshold: "0.80",
        })
        .returning();
    }

    const autoMetadata = libSettings?.autoMetadataOnScan ?? true;
    const matchThreshold = libSettings?.matchConfidenceThreshold
      ? parseFloat(libSettings.matchConfidenceThreshold)
      : 0.8;

    console.log(
      `[Scan] Library settings: autoMetadata=${autoMetadata}, threshold=${matchThreshold}`
    );

    // Update scan status to scanning
    await db
      .update(mediaLibraries)
      .set({ scanStatus: "scanning", updatedAt: new Date() })
      .where(eq(mediaLibraries.id, id));

    try {
      // Scan the library path - use depth 3 for TV libraries (Show/Season/File), 2 for movies
      const scanDepth = library.type === "tv" ? 3 : 2;
      console.log(`[Scan] Starting scan of library ${library.label} (${library.type}) at depth ${scanDepth}`);
      console.log(`[Scan] Path: ${library.path}`);

      const scanResult = await scanLibraryPath(library.path, { depth: scanDepth });

      console.log(`[Scan] Found ${scanResult.videoFiles.length} video files, ${scanResult.subtitleFiles.length} subtitle files`);

      if (scanResult.errors.length > 0) {
        console.warn("Scan had errors:", scanResult.errors);
      }

      // Auto-organize rogue files in root directory
      const rogueFiles = scanResult.videoFiles.filter((file) => {
        const dir = path.dirname(file.relativePath);
        return dir === "." || dir === "";
      });

      if (rogueFiles.length > 0) {
        console.log(
          `[Scan] Found ${rogueFiles.length} rogue file(s) in library root, organizing...`
        );
        const { FileOrganizer } = await import("@/src/lib/file-organizer");
        const organizer = new FileOrganizer();

        for (const file of rogueFiles) {
          try {
            const fullPath = path.join(library.path, file.relativePath);
            const result = await organizer.organizeRogueFile(
              fullPath,
              library.path
            );

            if (result.success && result.newPath) {
              console.log(
                `[Scan] Organized ${file.fileName} into folder (moved ${result.filesMoved} file(s))`
              );
              // Update the file path in scanResult for subsequent processing
              file.filePath = result.newPath;
              file.relativePath = path.relative(library.path, result.newPath);
            } else {
              console.warn(
                `[Scan] Could not organize ${file.fileName}: ${result.error}`
              );
            }
          } catch (error) {
            console.error(
              `[Scan] Error organizing ${file.fileName}:`,
              error
            );
            // Continue with other files
          }
        }
      }

      // Get existing files for this library
      const existingFiles = await db
        .select({ filePath: mediaFiles.filePath, id: mediaFiles.id })
        .from(mediaFiles)
        .where(eq(mediaFiles.libraryId, id));

      const existingPathMap = new Map(
        existingFiles.map((f) => [f.filePath, f.id])
      );

      // Track new and updated files
      let newFilesCount = 0;
      let existingFilesCount = 0;
      const newFilesForMetadata: Array<{
        id: string;
        filePath: string;
        fileName: string;
        parsedTitle: string | null;
        parsedYear: string | null;
        parsedSeason: number | null;
        parsedEpisode: number | null;
      }> = [];

      // Process video files
      for (const videoFile of scanResult.videoFiles) {
        if (existingPathMap.has(videoFile.filePath)) {
          existingFilesCount++;
          continue;
        }

        // Check for local metadata file
        const localMetadata = await loadMetadataFile(videoFile.filePath);

        // Parse TV show information from file path (for TV libraries)
        let parsedTV = null;
        if (library.type === "tv") {
          parsedTV = parseTVShowPath(videoFile.filePath, library.path);
        }

        // Check if local poster exists
        let localPosterExists = false;
        try {
          const posterPath = getPosterPath(videoFile.filePath);
          await fs.access(posterPath);
          localPosterExists = true;
        } catch {
          // Poster doesn't exist
        }

        // Insert new file with metadata if available
        const [insertedFile] = await db
          .insert(mediaFiles)
          .values({
            libraryId: id,
            filePath: videoFile.filePath,
            fileName: videoFile.fileName,
            fileSize: videoFile.fileSize,
            fileExtension: videoFile.fileExtension,
            renameStatus: "pending",
            // Populate parsed info from file path (for TV shows)
            ...(parsedTV && {
              parsedTitle: parsedTV.showName,
              parsedSeason: parsedTV.season,
              parsedEpisode: parsedTV.episode,
            }),
            // Populate from local metadata if available (overrides parsed data)
            ...(localMetadata && {
              seerrVerified: true,
              seerrTitle: localMetadata.title,
              seerrYear: localMetadata.year,
              seerrTmdbId: localMetadata.tmdbId,
              seerrOverview: localMetadata.overview,
              seerrPosterPath: localMetadata.posterPath || localMetadata.posterUrl,
              seerrBackdropPath: localMetadata.backdropPath || localMetadata.backdropUrl,
              seerrVoteAverage: localMetadata.voteAverage?.toString(),
              seerrMatchScore: localMetadata.matchScore?.toString(),
              seerrCast: localMetadata.cast,
              parsedTitle: localMetadata.title || parsedTV?.showName,
              parsedYear: localMetadata.year,
              parsedSeason: localMetadata.season || parsedTV?.season,
              parsedEpisode: localMetadata.episode || parsedTV?.episode,
            }),
          })
          .returning();

        if (localMetadata) {
          console.log(`[Scan] Loaded local metadata for ${videoFile.fileName}`);
        } else if (autoMetadata && !localMetadata) {
          // Queue for auto-metadata fetch if enabled and no local metadata exists
          newFilesForMetadata.push({
            id: insertedFile.id,
            filePath: insertedFile.filePath,
            fileName: insertedFile.fileName,
            parsedTitle: insertedFile.parsedTitle,
            parsedYear: insertedFile.parsedYear,
            parsedSeason: insertedFile.parsedSeason,
            parsedEpisode: insertedFile.parsedEpisode,
          });
        }

        // Find and associate subtitles
        const associatedSubs = await findAssociatedSubtitles(videoFile.filePath);
        if (associatedSubs.length > 0) {
          for (const subPath of associatedSubs) {
            // Extract language from filename (e.g., "Movie.en.srt" -> "en")
            const subFileName = path.basename(subPath);
            const videoBaseName = path.basename(
              videoFile.filePath,
              path.extname(videoFile.filePath)
            );
            const langMatch = subFileName
              .replace(videoBaseName, "")
              .match(/\.([a-z]{2,3})\./i);
            const language = langMatch ? langMatch[1] : null;

            await db.insert(subtitleFiles).values({
              mediaFileId: insertedFile.id,
              filePath: subPath,
              language,
              extension: path.extname(subPath).slice(1),
            });
          }
        }

        newFilesCount++;
      }

      // Process auto-metadata for new files
      let metadataSuccessCount = 0;
      let metadataFailedCount = 0;

      if (autoMetadata && newFilesForMetadata.length > 0) {
        console.log(
          `[Scan] Auto-fetching metadata for ${newFilesForMetadata.length} new files (threshold: ${matchThreshold})`
        );

        const BATCH_SIZE = 5;
        const DELAY_MS = 1000; // 1 second between batches

        for (let i = 0; i < newFilesForMetadata.length; i += BATCH_SIZE) {
          const batch = newFilesForMetadata.slice(i, i + BATCH_SIZE);

          const results = await Promise.allSettled(
            batch.map((file) =>
              fetchMetadataForFile({
                fileId: file.id,
                filePath: file.filePath,
                fileName: file.fileName,
                parsedTitle: file.parsedTitle,
                parsedYear: file.parsedYear,
                parsedSeason: file.parsedSeason,
                parsedEpisode: file.parsedEpisode,
                threshold: matchThreshold,
                hard: false,
              })
            )
          );

          // Count successes and failures
          results.forEach((result) => {
            if (result.status === "fulfilled" && result.value.success) {
              metadataSuccessCount++;
            } else {
              metadataFailedCount++;
            }
          });

          // Delay between batches to avoid rate limiting
          if (i + BATCH_SIZE < newFilesForMetadata.length) {
            await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
          }
        }

        console.log(
          `[Scan] Auto-metadata complete: ${metadataSuccessCount} succeeded, ${metadataFailedCount} failed`
        );
      }

      // Update library scan status
      await db
        .update(mediaLibraries)
        .set({
          scanStatus: "idle",
          lastScanAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(mediaLibraries.id, id));

      return NextResponse.json({
        success: true,
        stats: {
          newFiles: newFilesCount,
          existingFiles: existingFilesCount,
          totalScanned: scanResult.videoFiles.length,
          subtitlesFound: scanResult.subtitleFiles.length,
          totalSize: scanResult.totalSize,
          errors: scanResult.errors.length,
          metadataFetched: metadataSuccessCount,
          metadataFailed: metadataFailedCount,
        },
      });
    } catch (scanError) {
      // Update scan status to error
      await db
        .update(mediaLibraries)
        .set({ scanStatus: "error", updatedAt: new Date() })
        .where(eq(mediaLibraries.id, id));

      throw scanError;
    }
  } catch (error) {
    console.error("Error scanning library:", error);
    return NextResponse.json(
      { error: "Failed to scan library" },
      { status: 500 }
    );
  }
}
