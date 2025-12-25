import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { mediaFiles, seerrSettings, users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { SeerrClient } from "@/src/lib/seerr-client";

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
      return NextResponse.json({ error: "Media file not found" }, { status: 404 });
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
        { error: "Seerr is not connected. Please test connection in settings." },
        { status: 400 }
      );
    }

    // Get library type to determine if movie or TV
    const libraryType =
      (mediaFile.parsedSeason && mediaFile.parsedEpisode) ? "tv" : "movie";

    // Create Seerr client and fetch metadata
    const client = new SeerrClient(settings.apiKey, settings.apiUrl);

    if (libraryType === "movie") {
      const result = await client.verifyMovie(
        mediaFile.parsedTitle || "",
        mediaFile.parsedYear || undefined,
        0.8
      );

      if (result.verified && result.data) {
        console.log("Seerr movie metadata:", JSON.stringify(result.data, null, 2));

        // Fetch cast information from TMDB if we have a TMDB ID
        let cast = null;
        if (result.data.id) {
          try {
            cast = await client.getMovieCredits(result.data.id);
            console.log(`Fetched ${cast.length} cast members`);
          } catch (error) {
            console.error("Failed to fetch cast:", error);
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
        mediaFile.parsedTitle || "",
        0.8
      );

      if (result.verified && result.data) {
        console.log("Seerr TV metadata:", JSON.stringify(result.data, null, 2));

        // Fetch cast information from TMDB if we have a TMDB ID
        let cast = null;
        if (result.data.id) {
          try {
            cast = await client.getTVCredits(result.data.id);
            console.log(`Fetched ${cast.length} cast members`);
          } catch (error) {
            console.error("Failed to fetch cast:", error);
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
        error: error instanceof Error ? error.message : "Failed to fetch metadata",
      },
      { status: 500 }
    );
  }
}
