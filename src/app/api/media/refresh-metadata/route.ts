/**
 * Bulk metadata refresh API
 * Refresh metadata from Seerr for multiple media files
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { mediaFiles, seerrSettings, mediaLibraries, users } from "@/src/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { SeerrClient } from "@/src/lib/seerr-client";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { mediaIds, libraryId } = body as {
      mediaIds?: string[];
      libraryId?: string;
    };

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
        { error: "Seerr is not connected. Please test connection in settings." },
        { status: 400 }
      );
    }

    // Get media files to refresh
    let mediaFilesToRefresh;

    if (mediaIds && mediaIds.length > 0) {
      // Refresh specific media files
      mediaFilesToRefresh = await db
        .select()
        .from(mediaFiles)
        .where(inArray(mediaFiles.id, mediaIds));
    } else if (libraryId) {
      // Refresh all files in a library
      mediaFilesToRefresh = await db
        .select()
        .from(mediaFiles)
        .where(eq(mediaFiles.libraryId, libraryId));
    } else {
      return NextResponse.json(
        { error: "Either mediaIds or libraryId must be provided" },
        { status: 400 }
      );
    }

    if (mediaFilesToRefresh.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        updated: 0,
        failed: 0,
      });
    }

    // Create Seerr client
    const client = new SeerrClient(settings.apiKey, settings.apiUrl);

    // Process files in parallel with concurrency limit
    const BATCH_SIZE = 10; // Process 10 files at a time
    const results = [];

    for (let i = 0; i < mediaFilesToRefresh.length; i += BATCH_SIZE) {
      const batch = mediaFilesToRefresh.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (mediaFile) => {
          // Determine if movie or TV
          const isTV = Boolean(mediaFile.parsedSeason && mediaFile.parsedEpisode);

          if (isTV) {
            // TV show
            const result = await client.verifyTV(mediaFile.parsedTitle || "", 0.8);

            if (result.verified && result.data) {
              await db
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
                  seerrMatchScore: result.data.match_score?.toString(),
                  updatedAt: new Date(),
                })
                .where(eq(mediaFiles.id, mediaFile.id));
              return { success: true, id: mediaFile.id };
            } else {
              return { success: false, id: mediaFile.id, error: "Not verified" };
            }
          } else {
            // Movie
            const result = await client.verifyMovie(
              mediaFile.parsedTitle || "",
              mediaFile.parsedYear || undefined,
              0.8
            );

            if (result.verified && result.data) {
              await db
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
                  seerrMatchScore: result.data.match_score?.toString(),
                  updatedAt: new Date(),
                })
                .where(eq(mediaFiles.id, mediaFile.id));
              return { success: true, id: mediaFile.id };
            } else {
              return { success: false, id: mediaFile.id, error: "Not verified" };
            }
          }
        })
      );

      results.push(...batchResults);
    }

    // Count successes and failures
    let updated = 0;
    let failed = 0;

    for (const result of results) {
      if (result.status === "fulfilled" && result.value.success) {
        updated++;
      } else {
        failed++;
        if (result.status === "rejected") {
          console.error(`Error refreshing metadata:`, result.reason);
        } else if (result.status === "fulfilled") {
          console.error(`Failed to verify:`, result.value.error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed: mediaFilesToRefresh.length,
      updated,
      failed,
    });
  } catch (error) {
    console.error("Error refreshing metadata:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to refresh metadata",
      },
      { status: 500 }
    );
  }
}
