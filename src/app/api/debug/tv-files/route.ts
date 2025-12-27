import { NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaFiles, mediaLibraries } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const tvLibraries = await db
    .select({ id: mediaLibraries.id })
    .from(mediaLibraries)
    .where(eq(mediaLibraries.type, "tv"));

  if (tvLibraries.length === 0) {
    return NextResponse.json({ error: "No TV libraries found" });
  }

  const files = await db
    .select({
      fileName: mediaFiles.fileName,
      parsedTitle: mediaFiles.parsedTitle,
      seerrTitle: mediaFiles.seerrTitle,
      manualTitle: mediaFiles.manualTitle,
      parsedSeason: mediaFiles.parsedSeason,
      parsedEpisode: mediaFiles.parsedEpisode,
    })
    .from(mediaFiles)
    .where(eq(mediaFiles.libraryId, tvLibraries[0].id))
    .limit(20);

  return NextResponse.json({ files });
}
