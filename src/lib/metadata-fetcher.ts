/**
 * Metadata Fetcher Utility
 * Reusable logic for fetching TMDB metadata for media files
 */

import { SeerrClient } from "./seerr-client";
import { db } from "./db";
import { mediaFiles, seerrSettings } from "./db/schema";
import { eq } from "drizzle-orm";
import {
  saveMetadataFile,
  downloadMediaImages,
  createMovieMetadata,
  createTVMetadata,
  deleteMetadataFiles,
} from "./metadata-file";
import { PatternCleaner } from "./pattern-cleaner";
import path from "path";

export interface MetadataFetchOptions {
  /** File ID in database */
  fileId: string;
  /** Absolute file path */
  filePath: string;
  /** File name */
  fileName: string;
  /** Parsed title from file name */
  parsedTitle: string | null;
  /** Parsed year from file name */
  parsedYear: string | null;
  /** Parsed season number (for TV) */
  parsedSeason: number | null;
  /** Parsed episode number (for TV) */
  parsedEpisode: number | null;
  /** Match confidence threshold (0.0 - 1.0) */
  threshold?: number;
  /** Hard refresh - clear cache and metadata files */
  hard?: boolean;
}

export interface MetadataFetchResult {
  success: boolean;
  fileId: string;
  error?: string;
  tmdbId?: number;
  title?: string;
}

/**
 * Get Seerr client instance with configured settings
 */
async function getSeerrClient(): Promise<{
  client: SeerrClient;
  error?: string;
}> {
  const [settings] = await db
    .select()
    .from(seerrSettings)
    .orderBy(seerrSettings.id)
    .limit(1);

  if (!settings || !settings.apiUrl || !settings.apiKey) {
    return { client: null as any, error: "Seerr is not configured" };
  }

  if (settings.connectionStatus !== "connected") {
    return {
      client: null as any,
      error: "Seerr is not connected. Please test connection in settings.",
    };
  }

  return { client: new SeerrClient(settings.apiKey, settings.apiUrl) };
}

/**
 * Fetch metadata for a single media file
 */
export async function fetchMetadataForFile(
  options: MetadataFetchOptions
): Promise<MetadataFetchResult> {
  const {
    fileId,
    filePath,
    fileName,
    parsedTitle,
    parsedYear,
    parsedSeason,
    parsedEpisode,
    threshold = 0.8,
    hard = false,
  } = options;

  try {
    // Get Seerr client
    const { client, error } = await getSeerrClient();
    if (error || !client) {
      return { success: false, fileId, error: error || "Client error" };
    }

    // Determine if TV or movie
    const isTV = Boolean(parsedSeason && parsedEpisode);

    // Derive search title from file/folder name
    const fileBase = fileName || path.basename(filePath);
    const folderName = path.basename(path.dirname(filePath));
    const rawSearchTitle =
      isTV && folderName
        ? folderName
        : fileBase.replace(path.extname(fileBase), "");
    const cleaner = new PatternCleaner();
    const searchTitle = cleaner.cleanForSearch(rawSearchTitle);

    console.log(
      `[Metadata] Fetching metadata for ${filePath} using search title="${searchTitle}"`
    );

    if (isTV) {
      // TV show
      const result = await client.verifyTV(
        searchTitle || parsedTitle || "",
        threshold,
        hard,
        fileName
      );

      if (result.verified && result.data) {
        // Fetch full details for rich metadata
        const fullDetails = await client.getTVDetails(result.data.id, hard);
        const detailsData = fullDetails || result.data;

        // If hard refresh, delete existing metadata files
        if (hard) {
          try {
            await deleteMetadataFiles(filePath);
          } catch (e) {
            console.warn(
              `[Metadata] Failed to delete existing metadata for ${filePath}:`,
              e
            );
          }
        }

        // Update database
        await db
          .update(mediaFiles)
          .set({
            seerrVerified: true,
            seerrTitle: result.data.name,
            seerrYear: result.data.first_air_date?.substring(0, 4),
            seerrTmdbId: result.data.id,
            seerrOverview: result.data.overview,
            seerrPosterPath:
              detailsData.posterPath ||
              detailsData.poster_path ||
              result.data.poster_path,
            seerrBackdropPath:
              detailsData.backdropPath ||
              detailsData.backdrop_path ||
              result.data.backdrop_path,
            seerrVoteAverage: result.data.vote_average?.toString(),
            seerrMatchScore: result.data.match_score?.toString(),
            updatedAt: new Date(),
          })
          .where(eq(mediaFiles.id, fileId));

        // Save metadata file and download images
        try {
          const metadata = createTVMetadata(
            detailsData,
            parsedSeason ?? undefined,
            parsedEpisode ?? undefined,
            result.data.match_score
          );
          await saveMetadataFile(filePath, metadata);

          const posterPath =
            detailsData.posterPath ||
            detailsData.poster_path ||
            result.data.poster_path;
          const backdropPath =
            detailsData.backdropPath ||
            detailsData.backdrop_path ||
            result.data.backdrop_path;

          const images = await downloadMediaImages(
            filePath,
            posterPath,
            backdropPath
          );

          if (images.poster) metadata.posterPath = images.poster;
          if (images.backdrop) metadata.backdropPath = images.backdrop;

          if (images.poster || images.backdrop) {
            await saveMetadataFile(filePath, metadata);
          }
        } catch (metadataError) {
          console.error(
            `[Metadata] Failed to save metadata for ${filePath}:`,
            metadataError
          );
        }

        console.log(
          `[Metadata] Successfully fetched TV metadata for ${fileName}: ${result.data.name} (TMDB: ${result.data.id})`
        );

        return {
          success: true,
          fileId,
          tmdbId: result.data.id,
          title: result.data.name,
        };
      } else {
        return {
          success: false,
          fileId,
          error: "No match found or verification failed",
        };
      }
    } else {
      // Movie
      const result = await client.verifyMovie(
        searchTitle || parsedTitle || "",
        parsedYear || undefined,
        threshold,
        hard,
        fileName
      );

      if (result.verified && result.data) {
        // Fetch full details for rich metadata
        const fullDetails = await client.getMovieDetails(result.data.id, hard);
        const detailsData = fullDetails || result.data;

        if (hard) {
          try {
            await deleteMetadataFiles(filePath);
          } catch (e) {
            console.warn(
              `[Metadata] Failed to delete existing metadata for ${filePath}:`,
              e
            );
          }
        }

        // Update database
        await db
          .update(mediaFiles)
          .set({
            seerrVerified: true,
            seerrTitle: result.data.title,
            seerrYear: result.data.release_date?.substring(0, 4),
            seerrTmdbId: result.data.id,
            seerrOverview: result.data.overview,
            seerrPosterPath:
              detailsData.posterPath ||
              detailsData.poster_path ||
              result.data.poster_path,
            seerrBackdropPath:
              detailsData.backdropPath ||
              detailsData.backdrop_path ||
              result.data.backdrop_path,
            seerrVoteAverage: result.data.vote_average?.toString(),
            seerrMatchScore: result.data.match_score?.toString(),
            updatedAt: new Date(),
          })
          .where(eq(mediaFiles.id, fileId));

        // Save metadata file and download images
        try {
          const metadata = createMovieMetadata(
            detailsData,
            result.data.match_score
          );
          await saveMetadataFile(filePath, metadata);

          const posterPath =
            detailsData.posterPath ||
            detailsData.poster_path ||
            result.data.poster_path;
          const backdropPath =
            detailsData.backdropPath ||
            detailsData.backdrop_path ||
            result.data.backdrop_path;

          const images = await downloadMediaImages(
            filePath,
            posterPath,
            backdropPath
          );

          if (images.poster) metadata.posterPath = images.poster;
          if (images.backdrop) metadata.backdropPath = images.backdrop;

          if (images.poster || images.backdrop) {
            await saveMetadataFile(filePath, metadata);
          }
        } catch (metadataError) {
          console.error(
            `[Metadata] Failed to save metadata for ${filePath}:`,
            metadataError
          );
        }

        console.log(
          `[Metadata] Successfully fetched movie metadata for ${fileName}: ${result.data.title} (TMDB: ${result.data.id})`
        );

        return {
          success: true,
          fileId,
          tmdbId: result.data.id,
          title: result.data.title,
        };
      } else {
        return {
          success: false,
          fileId,
          error: "No match found or verification failed",
        };
      }
    }
  } catch (error) {
    console.error(`[Metadata] Error fetching metadata for ${filePath}:`, error);
    return {
      success: false,
      fileId,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
