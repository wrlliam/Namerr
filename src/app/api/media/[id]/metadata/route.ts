import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { mediaFiles, seerrSettings, users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { SeerrClient } from "@/src/lib/seerr-client";
import {
  saveMetadataFile,
  downloadMediaImages,
  createMovieMetadata,
  createTVMetadata,
  deleteMetadataFiles,
} from "@/src/lib/metadata-file";
import { seerrCache } from "@/src/lib/cache";

interface Params {
  id: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    // Get media file
    const [mediaFile] = await db
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.id, id))
      .limit(1);

    if (!mediaFile) {
      return NextResponse.json(
        { error: "Media file not found" },
        { status: 404 }
      );
    }

    // Get Seerr settings
    const [settings] = await db
      .select()
      .from(seerrSettings)
      .orderBy(seerrSettings.id)
      .limit(1);

    if (!settings || !settings.apiUrl || !settings.apiKey) {
      return NextResponse.json(
        { error: "Seerr is not configured" },
        { status: 400 }
      );
    }

    if (settings.connectionStatus !== "connected") {
      return NextResponse.json(
        {
          error: "Seerr is not connected. Please test connection in settings.",
        },
        { status: 400 }
      );
    }

    // Get library type to determine if movie or TV
    const libraryType =
      mediaFile.parsedSeason && mediaFile.parsedEpisode ? "tv" : "movie";

    // Read optional body (supports { hard: true })
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const hard = Boolean(body?.hard);

    // If hard refresh requested, clear relevant Seerr cache
    if (hard) {
      try {
        await seerrCache.clear("search*");
        await seerrCache.del("user_requests:all");
        console.log(
          "[Seerr] Hard refresh requested - cleared search and user requests cache"
        );
      } catch (e) {
        console.warn("[Seerr] Failed to clear cache for hard refresh:", e);
      }
    }

    // Create Seerr client and fetch metadata
    const client = new SeerrClient(settings.apiKey, settings.apiUrl);

    // Derive a search title from the file/folder name (do NOT use stored metadata)
    const pathModule = await import("path");
    const { PatternCleaner } = await import("@/src/lib/pattern-cleaner");
    const fileBase =
      mediaFile.fileName || pathModule.basename(mediaFile.filePath);
    const folderName = pathModule.basename(
      pathModule.dirname(mediaFile.filePath)
    );
    const rawSearchTitle =
      libraryType === "tv" && folderName
        ? folderName
        : fileBase.replace(pathModule.extname(fileBase), "");
    const cleaner = new PatternCleaner();
    const searchTitle = cleaner.cleanForSearch(rawSearchTitle);

    if (libraryType === "movie") {
      const result = await client.verifyMovie(
        searchTitle || mediaFile.parsedTitle || "",
        mediaFile.parsedYear || undefined,
        0.8,
        hard,
        mediaFile.fileName
      );

      if (result.verified && result.data) {
        // Fetch cast information from TMDB if we have a TMDB ID
        let cast = null;
        if (result.data.id) {
          try {
            cast = await client.getMovieCredits(result.data.id);
          } catch {
            // Cast fetch failed, continue without cast
          }
        }

        // Update media file with Seerr metadata
        const [updated] = await db
          .update(mediaFiles)
          .set({
            seerrVerified: true,
            seerrTitle: result.data.title,
            seerrYear: result.data.release_date?.substring(0, 4),
            seerrTmdbId: result.data.id,
            seerrOverview: result.data.overview,
            seerrPosterPath: result.data.poster_path,
            seerrBackdropPath: result.data.backdrop_path,
            seerrVoteAverage: result.data.vote_average?.toString(),
            seerrCast: cast,
            seerrMatchScore: result.data.match_score?.toString(),
            updatedAt: new Date(),
          })
          .where(eq(mediaFiles.id, id))
          .returning();

        // If hard refresh, remove existing metadata files before saving new ones
        if (hard) {
          try {
            await deleteMetadataFiles(mediaFile.filePath);
          } catch (e) {
            console.warn(
              `[Metadata] Failed to delete existing metadata files for hard refresh ${mediaFile.filePath}:`,
              e
            );
          }
        }

        // Save metadata file alongside the media file
        try {
          const metadata = createMovieMetadata(
            result.data,
            result.data.match_score
          );
          if (cast) {
            metadata.cast = cast;
          }
          await saveMetadataFile(mediaFile.filePath, metadata);

          // Download images
          const images = await downloadMediaImages(
            mediaFile.filePath,
            result.data.poster_path,
            result.data.backdrop_path
          );
          if (images.poster || images.backdrop) {
            if (images.poster) metadata.posterPath = images.poster;
            if (images.backdrop) metadata.backdropPath = images.backdrop;
            await saveMetadataFile(mediaFile.filePath, metadata);
          }
        } catch (metadataError) {
          console.error(
            `[Metadata] Failed to save metadata for ${mediaFile.filePath}:`,
            metadataError
          );
        }

        return NextResponse.json({
          success: true,
          verified: true,
          metadata: {
            title: result.data.title,
            year: result.data.release_date?.substring(0, 4),
            overview: result.data.overview,
            tmdbId: result.data.id,
            posterPath: result.data.poster_path,
            matchScore: result.data.match_score,
            source: result.data.source,
          },
        });
      } else {
        return NextResponse.json({
          success: false,
          verified: false,
          error: "No matching metadata found in Seerr",
        });
      }
    } else {
      // TV show
      const result = await client.verifyTV(
        searchTitle || mediaFile.parsedTitle || "",
        0.8,
        hard,
        mediaFile.fileName
      );

      if (result.verified && result.data) {
        // Fetch cast information from TMDB if we have a TMDB ID
        let cast = null;
        if (result.data.id) {
          try {
            cast = await client.getTVCredits(result.data.id);
          } catch {
            // Cast fetch failed, continue without cast
          }
        }

        // Update media file with Seerr metadata
        const [updated] = await db
          .update(mediaFiles)
          .set({
            seerrVerified: true,
            seerrTitle: result.data.name,
            seerrYear: result.data.first_air_date?.substring(0, 4),
            seerrTmdbId: result.data.id,
            seerrOverview: result.data.overview,
            seerrPosterPath: result.data.poster_path,
            seerrBackdropPath: result.data.backdrop_path,
            seerrVoteAverage: result.data.vote_average?.toString(),
            seerrCast: cast,
            seerrMatchScore: result.data.match_score?.toString(),
            updatedAt: new Date(),
          })
          .where(eq(mediaFiles.id, id))
          .returning();

        // If hard refresh, remove existing metadata files before saving new ones
        if (hard) {
          try {
            await deleteMetadataFiles(mediaFile.filePath);
          } catch (e) {
            console.warn(
              `[Metadata] Failed to delete existing metadata files for hard refresh ${mediaFile.filePath}:`,
              e
            );
          }
        }

        // Save metadata file alongside the media file
        try {
          const metadata = createTVMetadata(
            result.data,
            mediaFile.parsedSeason ?? undefined,
            mediaFile.parsedEpisode ?? undefined,
            result.data.match_score
          );
          if (cast) {
            metadata.cast = cast;
          }
          await saveMetadataFile(mediaFile.filePath, metadata);

          // Download images
          const images = await downloadMediaImages(
            mediaFile.filePath,
            result.data.poster_path,
            result.data.backdrop_path
          );
          if (images.poster || images.backdrop) {
            if (images.poster) metadata.posterPath = images.poster;
            if (images.backdrop) metadata.backdropPath = images.backdrop;
            await saveMetadataFile(mediaFile.filePath, metadata);
          }
        } catch (metadataError) {
          console.error(
            `[Metadata] Failed to save metadata for ${mediaFile.filePath}:`,
            metadataError
          );
        }

        return NextResponse.json({
          success: true,
          verified: true,
          metadata: {
            name: result.data.name,
            year: result.data.first_air_date?.substring(0, 4),
            overview: result.data.overview,
            tmdbId: result.data.id,
            posterPath: result.data.poster_path,
            matchScore: result.data.match_score,
            source: result.data.source,
          },
        });
      } else {
        return NextResponse.json({
          success: false,
          verified: false,
          error: "No matching metadata found in Seerr",
        });
      }
    }
  } catch (error) {
    console.error("Error fetching metadata:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch metadata",
      },
      { status: 500 }
    );
  }
}
