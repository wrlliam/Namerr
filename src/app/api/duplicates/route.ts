import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import {
  mediaFiles,
  mediaLibraries,
  duplicateExclusions,
} from "@/src/lib/db/schema";
import { eq, sql, isNotNull, and, or } from "drizzle-orm";
import fs from "fs/promises";
import path from "path";
import { deleteMetadataFiles } from "@/src/lib/metadata-file";

interface DuplicateFile {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  libraryId: string;
  libraryName: string;
  seerrTitle: string | null;
  seerrYear: string | null;
}

interface DuplicateGroup {
  tmdbId: number;
  title: string;
  year: string;
  type: "movie" | "tv";
  files: DuplicateFile[];
}

/**
 * GET /api/duplicates - Find all duplicates
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get all files with TMDB IDs, grouped by TMDB ID
    const filesWithTmdb = await db
      .select({
        id: mediaFiles.id,
        fileName: mediaFiles.fileName,
        filePath: mediaFiles.filePath,
        fileSize: mediaFiles.fileSize,
        libraryId: mediaFiles.libraryId,
        seerrTmdbId: mediaFiles.seerrTmdbId,
        seerrTitle: mediaFiles.seerrTitle,
        seerrYear: mediaFiles.seerrYear,
        parsedSeason: mediaFiles.parsedSeason,
        parsedEpisode: mediaFiles.parsedEpisode,
      })
      .from(mediaFiles)
      .where(isNotNull(mediaFiles.seerrTmdbId));

    // Get all libraries for name lookup
    const libraries = await db
      .select({
        id: mediaLibraries.id,
        name: mediaLibraries.name,
      })
      .from(mediaLibraries);

    const libraryMap = new Map(libraries.map((l) => [l.id, l.name]));

    // Get all exclusions
    const exclusions = await db.select().from(duplicateExclusions);

    // Create a set of excluded pairs for quick lookup
    const excludedPairs = new Set<string>();
    for (const ex of exclusions) {
      // Store both orderings for easy lookup
      excludedPairs.add(`${ex.fileId1}:${ex.fileId2}`);
      excludedPairs.add(`${ex.fileId2}:${ex.fileId1}`);
    }

    // Group files by TMDB ID
    const groupedByTmdb = new Map<number, typeof filesWithTmdb>();
    for (const file of filesWithTmdb) {
      if (!file.seerrTmdbId) continue;
      const existing = groupedByTmdb.get(file.seerrTmdbId) || [];
      existing.push(file);
      groupedByTmdb.set(file.seerrTmdbId, existing);
    }

    // Filter to only groups with 2+ files (potential duplicates)
    const duplicateGroups: DuplicateGroup[] = [];

    for (const [tmdbId, files] of groupedByTmdb) {
      if (files.length < 2) continue;

      // Check if all pairs in this group are excluded
      let hasUnexcludedPair = false;
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const pairKey = `${files[i].id}:${files[j].id}`;
          if (!excludedPairs.has(pairKey)) {
            hasUnexcludedPair = true;
            break;
          }
        }
        if (hasUnexcludedPair) break;
      }

      // Skip this group if all pairs are excluded
      if (!hasUnexcludedPair) continue;

      const firstFile = files[0];
      const isTV = firstFile.parsedSeason !== null;

      duplicateGroups.push({
        tmdbId,
        title: firstFile.seerrTitle || "Unknown",
        year: firstFile.seerrYear || "",
        type: isTV ? "tv" : "movie",
        files: files.map((f) => ({
          id: f.id,
          fileName: f.fileName,
          filePath: f.filePath,
          fileSize: f.fileSize,
          libraryId: f.libraryId,
          libraryName: libraryMap.get(f.libraryId) || "Unknown Library",
          seerrTitle: f.seerrTitle,
          seerrYear: f.seerrYear,
        })),
      });
    }

    // Sort by title
    duplicateGroups.sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json({
      duplicates: duplicateGroups,
      totalGroups: duplicateGroups.length,
      totalFiles: duplicateGroups.reduce((sum, g) => sum + g.files.length, 0),
    });
  } catch (error) {
    console.error("Error fetching duplicates:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch duplicates",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/duplicates - Delete specific files
 */
export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fileIds } = body as { fileIds: string[] };

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: "fileIds array is required" },
        { status: 400 }
      );
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const fileId of fileIds) {
      try {
        // Get file info
        const [file] = await db
          .select({
            id: mediaFiles.id,
            filePath: mediaFiles.filePath,
            libraryId: mediaFiles.libraryId,
          })
          .from(mediaFiles)
          .where(eq(mediaFiles.id, fileId))
          .limit(1);

        if (!file) {
          results.push({ id: fileId, success: false, error: "File not found" });
          continue;
        }

        // Get library path
        const [library] = await db
          .select({ path: mediaLibraries.path })
          .from(mediaLibraries)
          .where(eq(mediaLibraries.id, file.libraryId))
          .limit(1);

        if (!library) {
          results.push({
            id: fileId,
            success: false,
            error: "Library not found",
          });
          continue;
        }

        // Construct full path
        const fullPath = path.isAbsolute(file.filePath)
          ? file.filePath
          : path.join(library.path, file.filePath);

        // Delete metadata files first
        try {
          await deleteMetadataFiles(fullPath);
        } catch (e) {
          console.warn(`Failed to delete metadata files for ${fullPath}:`, e);
        }

        // Delete the actual file
        try {
          await fs.unlink(fullPath);
        } catch (e) {
          // File might already be deleted or inaccessible
          console.warn(`Failed to delete file ${fullPath}:`, e);
        }

        // Delete from database (this will cascade to exclusions)
        await db.delete(mediaFiles).where(eq(mediaFiles.id, fileId));

        results.push({ id: fileId, success: true });
      } catch (error) {
        results.push({
          id: fileId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: failCount === 0,
      results,
      summary: {
        deleted: successCount,
        failed: failCount,
      },
    });
  } catch (error) {
    console.error("Error deleting duplicates:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete duplicates",
      },
      { status: 500 }
    );
  }
}
