import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaLibraries, mediaFiles, subtitleFiles } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { scanLibraryPath, findAssociatedSubtitles } from "@/src/lib/file-scanner";
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

    // Update scan status to scanning
    await db
      .update(mediaLibraries)
      .set({ scanStatus: "scanning", updatedAt: new Date() })
      .where(eq(mediaLibraries.id, id));

    try {
      // Scan the library path
      const scanResult = await scanLibraryPath(library.path);

      if (scanResult.errors.length > 0) {
        console.warn("Scan had errors:", scanResult.errors);
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

      // Process video files
      for (const videoFile of scanResult.videoFiles) {
        if (existingPathMap.has(videoFile.filePath)) {
          existingFilesCount++;
          continue;
        }

        // Insert new file
        const [insertedFile] = await db
          .insert(mediaFiles)
          .values({
            libraryId: id,
            filePath: videoFile.filePath,
            fileName: videoFile.fileName,
            fileSize: videoFile.fileSize,
            fileExtension: videoFile.fileExtension,
            renameStatus: "pending",
          })
          .returning();

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
