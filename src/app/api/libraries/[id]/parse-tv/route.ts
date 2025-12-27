import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaLibraries, mediaFiles } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq, and, isNull, or } from "drizzle-orm";
import { parseTVShowPath } from "@/src/lib/tv-parser";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/libraries/[id]/parse-tv - Parse TV show info for existing files
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

    if (library.type !== "tv") {
      return NextResponse.json(
        { error: "This endpoint is only for TV libraries" },
        { status: 400 }
      );
    }

    // Get all files in this library that don't have parsed info
    const files = await db
      .select({
        id: mediaFiles.id,
        filePath: mediaFiles.filePath,
      })
      .from(mediaFiles)
      .where(
        and(
          eq(mediaFiles.libraryId, id),
          or(
            isNull(mediaFiles.parsedTitle),
            isNull(mediaFiles.parsedSeason),
            isNull(mediaFiles.parsedEpisode)
          )
        )
      );

    console.log(`[Parse TV] Parsing ${files.length} files for library ${library.label}`);

    let updatedCount = 0;

    for (const file of files) {
      const parsedTV = parseTVShowPath(file.filePath, library.path);

      if (parsedTV.showName || parsedTV.season || parsedTV.episode) {
        await db
          .update(mediaFiles)
          .set({
            parsedTitle: parsedTV.showName,
            parsedSeason: parsedTV.season,
            parsedEpisode: parsedTV.episode,
          })
          .where(eq(mediaFiles.id, file.id));

        updatedCount++;
      }
    }

    console.log(`[Parse TV] Updated ${updatedCount} files`);

    return NextResponse.json({
      success: true,
      totalFiles: files.length,
      updatedFiles: updatedCount,
    });
  } catch (error) {
    console.error("Error parsing TV files:", error);
    return NextResponse.json(
      { error: "Failed to parse TV files" },
      { status: 500 }
    );
  }
}
