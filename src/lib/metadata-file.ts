/**
 * Metadata File Manager
 * Saves and loads metadata files alongside media files
 * This allows sharing metadata across Namerr instances
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface MediaMetadata {
  // Basic info
  title: string;
  originalTitle?: string;
  year?: string;
  overview?: string;

  // IDs
  tmdbId?: number;
  imdbId?: string;
  tvdbId?: number;

  // Media type specific
  mediaType: "movie" | "tv";
  season?: number;
  episode?: number;
  episodeTitle?: string;

  // Images (relative paths to downloaded images)
  posterPath?: string;
  backdropPath?: string;
  posterUrl?: string; // Original URL for reference
  backdropUrl?: string;

  // Ratings
  ratings?: {
    source: string;
    value: number;
    votes?: number;
  }[];
  voteAverage?: number;

  // Cast & Crew
  cast?: {
    name: string;
    character?: string;
    profilePath?: string;
    order?: number;
  }[];
  directors?: string[];
  writers?: string[];

  // Additional info
  genres?: string[];
  runtime?: number; // minutes
  contentRating?: string; // e.g., "PG-13", "TV-MA"
  releaseDate?: string;
  firstAirDate?: string;
  lastAirDate?: string;
  status?: string; // "Released", "Ended", "Returning Series"

  // Network/Studio
  networks?: string[];
  studios?: string[];

  // Namerr specific
  matchScore?: number;
  verifiedAt?: string;
  namerrVersion?: string;
}

const METADATA_FILENAME = ".namerr-metadata.json";
const POSTER_FILENAME = "poster.jpg";
const BACKDROP_FILENAME = "backdrop.jpg";

/**
 * Get the metadata file path for a media file
 */
export function getMetadataFilePath(mediaFilePath: string): string {
  const dir = path.dirname(mediaFilePath);
  return path.join(dir, METADATA_FILENAME);
}

/**
 * Get the poster image path for a media file
 */
export function getPosterPath(mediaFilePath: string): string {
  const dir = path.dirname(mediaFilePath);
  const baseName = path.basename(mediaFilePath, path.extname(mediaFilePath));
  return path.join(dir, `${baseName}-poster.jpg`);
}

/**
 * Get the backdrop image path for a media file
 */
export function getBackdropPath(mediaFilePath: string): string {
  const dir = path.dirname(mediaFilePath);
  const baseName = path.basename(mediaFilePath, path.extname(mediaFilePath));
  return path.join(dir, `${baseName}-backdrop.jpg`);
}

/**
 * Save metadata to a JSON file alongside the media file
 */
export async function saveMetadataFile(
  mediaFilePath: string,
  metadata: MediaMetadata
): Promise<void> {
  const metadataPath = getMetadataFilePath(mediaFilePath);
  const dir = path.dirname(mediaFilePath);

  try {
    // Check if the directory exists and is writable
    try {
      await fs.access(dir, fs.constants.W_OK);
    } catch {
      console.warn(`[Metadata] Directory not writable or doesn't exist: ${dir}`);
      return; // Silently skip if directory is not writable
    }

    const content = JSON.stringify(metadata, null, 2);
    await fs.writeFile(metadataPath, content, "utf-8");
    console.log(`[Metadata] Saved metadata to ${metadataPath}`);
  } catch (error) {
    // Log but don't throw - metadata file saving is optional
    console.error(`[Metadata] Failed to save metadata to ${metadataPath}:`, error);
  }
}

/**
 * Load metadata from a JSON file alongside the media file
 */
export async function loadMetadataFile(
  mediaFilePath: string
): Promise<MediaMetadata | null> {
  const metadataPath = getMetadataFilePath(mediaFilePath);

  try {
    const exists = await fs
      .access(metadataPath)
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      return null;
    }

    const content = await fs.readFile(metadataPath, "utf-8");
    return JSON.parse(content) as MediaMetadata;
  } catch (error) {
    console.error(`[Metadata] Failed to load metadata from ${metadataPath}:`, error);
    return null;
  }
}

/**
 * Check if metadata file exists for a media file
 */
export async function hasMetadataFile(mediaFilePath: string): Promise<boolean> {
  const metadataPath = getMetadataFilePath(mediaFilePath);

  try {
    await fs.access(metadataPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download and save an image from TMDB
 */
export async function downloadImage(
  tmdbPath: string,
  savePath: string,
  size: "w300" | "w500" | "w780" | "original" = "w500"
): Promise<boolean> {
  if (!tmdbPath) return false;

  const url = `https://image.tmdb.org/t/p/${size}${tmdbPath}`;
  const dir = path.dirname(savePath);

  try {
    // Check if the directory exists and is writable
    try {
      await fs.access(dir, fs.constants.W_OK);
    } catch {
      console.warn(`[Metadata] Directory not writable for image: ${dir}`);
      return false;
    }

    const response = await fetch(url);

    if (!response.ok) {
      console.error(`[Metadata] Failed to download image from ${url}: ${response.status}`);
      return false;
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(savePath, Buffer.from(buffer));
    console.log(`[Metadata] Downloaded image to ${savePath}`);
    return true;
  } catch (error) {
    console.error(`[Metadata] Failed to download image from ${url}:`, error);
    return false;
  }
}

/**
 * Download poster and backdrop images for a media file
 */
export async function downloadMediaImages(
  mediaFilePath: string,
  posterTmdbPath?: string | null,
  backdropTmdbPath?: string | null
): Promise<{ poster?: string; backdrop?: string }> {
  const result: { poster?: string; backdrop?: string } = {};

  if (posterTmdbPath) {
    const posterPath = getPosterPath(mediaFilePath);
    const success = await downloadImage(posterTmdbPath, posterPath, "w500");
    if (success) {
      result.poster = path.basename(posterPath);
    }
  }

  if (backdropTmdbPath) {
    const backdropPath = getBackdropPath(mediaFilePath);
    const success = await downloadImage(backdropTmdbPath, backdropPath, "w780");
    if (success) {
      result.backdrop = path.basename(backdropPath);
    }
  }

  return result;
}

/**
 * Create a complete metadata object from Seerr API response (movie)
 */
export function createMovieMetadata(
  seerrData: any,
  matchScore?: number
): MediaMetadata {
  return {
    title: seerrData.title || "",
    originalTitle: seerrData.original_title,
    year: seerrData.release_date?.substring(0, 4),
    overview: seerrData.overview,
    mediaType: "movie",
    tmdbId: seerrData.id,
    imdbId: seerrData.imdb_id,
    posterUrl: seerrData.poster_path
      ? `https://image.tmdb.org/t/p/w500${seerrData.poster_path}`
      : undefined,
    backdropUrl: seerrData.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${seerrData.backdrop_path}`
      : undefined,
    posterPath: seerrData.poster_path,
    backdropPath: seerrData.backdrop_path,
    voteAverage: seerrData.vote_average,
    ratings: [
      {
        source: "TMDB",
        value: seerrData.vote_average || 0,
        votes: seerrData.vote_count,
      },
    ],
    cast: seerrData.credits?.cast?.slice(0, 10).map((c: any) => ({
      name: c.name,
      character: c.character,
      profilePath: c.profile_path,
      order: c.order,
    })),
    directors: seerrData.credits?.crew
      ?.filter((c: any) => c.job === "Director")
      .map((c: any) => c.name),
    writers: seerrData.credits?.crew
      ?.filter((c: any) => c.job === "Writer" || c.job === "Screenplay")
      .map((c: any) => c.name),
    genres: seerrData.genres?.map((g: any) => g.name),
    runtime: seerrData.runtime,
    contentRating: seerrData.certification,
    releaseDate: seerrData.release_date,
    status: seerrData.status,
    studios: seerrData.production_companies?.map((c: any) => c.name),
    matchScore,
    verifiedAt: new Date().toISOString(),
    namerrVersion: "1.0.0",
  };
}

/**
 * Create a complete metadata object from Seerr API response (TV)
 */
export function createTVMetadata(
  seerrData: any,
  season?: number,
  episode?: number,
  matchScore?: number
): MediaMetadata {
  return {
    title: seerrData.name || "",
    originalTitle: seerrData.original_name,
    year: seerrData.first_air_date?.substring(0, 4),
    overview: seerrData.overview,
    mediaType: "tv",
    season,
    episode,
    tmdbId: seerrData.id,
    tvdbId: seerrData.external_ids?.tvdb_id,
    imdbId: seerrData.external_ids?.imdb_id,
    posterUrl: seerrData.poster_path
      ? `https://image.tmdb.org/t/p/w500${seerrData.poster_path}`
      : undefined,
    backdropUrl: seerrData.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${seerrData.backdrop_path}`
      : undefined,
    posterPath: seerrData.poster_path,
    backdropPath: seerrData.backdrop_path,
    voteAverage: seerrData.vote_average,
    ratings: [
      {
        source: "TMDB",
        value: seerrData.vote_average || 0,
        votes: seerrData.vote_count,
      },
    ],
    cast: seerrData.credits?.cast?.slice(0, 10).map((c: any) => ({
      name: c.name,
      character: c.character,
      profilePath: c.profile_path,
      order: c.order,
    })),
    genres: seerrData.genres?.map((g: any) => g.name),
    runtime: seerrData.episode_run_time?.[0],
    contentRating: seerrData.content_ratings?.results?.find(
      (r: any) => r.iso_3166_1 === "US"
    )?.rating,
    firstAirDate: seerrData.first_air_date,
    lastAirDate: seerrData.last_air_date,
    status: seerrData.status,
    networks: seerrData.networks?.map((n: any) => n.name),
    studios: seerrData.production_companies?.map((c: any) => c.name),
    matchScore,
    verifiedAt: new Date().toISOString(),
    namerrVersion: "1.0.0",
  };
}

/**
 * Delete metadata file and associated images
 */
export async function deleteMetadataFiles(mediaFilePath: string): Promise<void> {
  const metadataPath = getMetadataFilePath(mediaFilePath);
  const posterPath = getPosterPath(mediaFilePath);
  const backdropPath = getBackdropPath(mediaFilePath);

  const filesToDelete = [metadataPath, posterPath, backdropPath];

  for (const filePath of filesToDelete) {
    try {
      await fs.unlink(filePath);
      console.log(`[Metadata] Deleted ${filePath}`);
    } catch {
      // File doesn't exist, ignore
    }
  }
}
