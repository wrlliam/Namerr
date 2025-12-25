import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { mediaFiles, mediaLibraries } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";

interface Params {
  id: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    const [mediaFile] = await db
      .select({
        id: mediaFiles.id,
        libraryId: mediaFiles.libraryId,
        filePath: mediaFiles.filePath,
        fileName: mediaFiles.fileName,
        fileSize: mediaFiles.fileSize,
        fileExtension: mediaFiles.fileExtension,
        parsedTitle: mediaFiles.parsedTitle,
        parsedYear: mediaFiles.parsedYear,
        parsedSeason: mediaFiles.parsedSeason,
        parsedEpisode: mediaFiles.parsedEpisode,
        seerrVerified: mediaFiles.seerrVerified,
        seerrTitle: mediaFiles.seerrTitle,
        seerrYear: mediaFiles.seerrYear,
        seerrTmdbId: mediaFiles.seerrTmdbId,
        seerrOverview: mediaFiles.seerrOverview,
        seerrPosterPath: mediaFiles.seerrPosterPath,
        seerrMatchScore: mediaFiles.seerrMatchScore,
        manualTitle: mediaFiles.manualTitle,
        manualYear: mediaFiles.manualYear,
        manualSeason: mediaFiles.manualSeason,
        manualEpisode: mediaFiles.manualEpisode,
        renameStatus: mediaFiles.renameStatus,
        lastRenamedAt: mediaFiles.lastRenamedAt,
        renameError: mediaFiles.renameError,
        createdAt: mediaFiles.createdAt,
        updatedAt: mediaFiles.updatedAt,
        libraryName: mediaLibraries.name,
        libraryType: mediaLibraries.type,
      })
      .from(mediaFiles)
      .leftJoin(mediaLibraries, eq(mediaFiles.libraryId, mediaLibraries.id))
      .where(eq(mediaFiles.id, id))
      .limit(1);

    if (!mediaFile) {
      return NextResponse.json({ error: "Media file not found" }, { status: 404 });
    }

    return NextResponse.json({ mediaFile });
  } catch (error) {
    console.error("Error fetching media file:", error);
    return NextResponse.json(
      { error: "Failed to fetch media file" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { manualTitle, manualYear, manualSeason, manualEpisode } = body;

    // Update media file
    const [updated] = await db
      .update(mediaFiles)
      .set({
        manualTitle: manualTitle || null,
        manualYear: manualYear || null,
        manualSeason: manualSeason ? parseInt(manualSeason, 10) : null,
        manualEpisode: manualEpisode ? parseInt(manualEpisode, 10) : null,
        renameStatus: "ready", // Mark as ready for renaming
        updatedAt: new Date(),
      })
      .where(eq(mediaFiles.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Media file not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, mediaFile: updated });
  } catch (error) {
    console.error("Error updating media file:", error);
    return NextResponse.json(
      { error: "Failed to update media file" },
      { status: 500 }
    );
  }
}
