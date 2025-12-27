/**
 * Global Reset All Metadata API route
 * Deletes ALL .namerr-metadata files from filesystem and clears Seerr metadata from database
 * across ALL libraries. Requires admin role.
 * Supports streaming progress updates via NDJSON
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaLibraries, mediaFiles } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { deleteMetadataFiles } from "@/src/lib/metadata-file";
import path from "path";

// POST /api/settings/reset-all-metadata - Reset metadata for ALL files across ALL libraries
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Require admin role for global reset
    const isAdmin = session.user.role === "admin";
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Admin role required for global reset" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { stream } = body as { stream?: boolean };

    // Get all libraries (need paths for file operations)
    const libraries = await db.select().from(mediaLibraries);

    // Create a map of library ID to library path
    const libraryPathMap = new Map(libraries.map((lib) => [lib.id, lib.path]));

    // Get ALL media files across all libraries
    const files = await db.select().from(mediaFiles);

    if (files.length === 0) {
      return NextResponse.json({
        success: true,
        deleted: 0,
        failed: 0,
        message: "No files to reset",
      });
    }

    if (stream) {
      // Streaming response (NDJSON)
      const encoder = new TextEncoder();
      const streamResponse = new ReadableStream({
        async start(controller) {
          let processed = 0;
          let deleted = 0;
          let failed = 0;

          for (const file of files) {
            try {
              // Get library path
              const libraryPath = libraryPathMap.get(file.libraryId);
              if (!libraryPath) {
                console.error(
                  `[ResetAllMetadata] Library not found for file ${file.fileName}`
                );
                failed++;
                continue;
              }

              // Delete filesystem metadata files (.namerr-metadata.json, poster, backdrop)
              const fullPath = path.join(libraryPath, file.filePath);
              await deleteMetadataFiles(fullPath);

              // Clear database Seerr fields
              await db
                .update(mediaFiles)
                .set({
                  seerrVerified: false,
                  seerrTitle: null,
                  seerrYear: null,
                  seerrTmdbId: null,
                  seerrOverview: null,
                  seerrPosterPath: null,
                  seerrBackdropPath: null,
                  seerrVoteAverage: null,
                  seerrMatchScore: null,
                  seerrCast: null,
                  updatedAt: new Date(),
                })
                .where(eq(mediaFiles.id, file.id));

              deleted++;
            } catch (error) {
              failed++;
              console.error(
                `[ResetAllMetadata] Failed to reset ${file.fileName}:`,
                error
              );
            }

            processed++;

            // Send progress update every 10 files or at the end
            if (processed % 10 === 0 || processed === files.length) {
              const update = {
                type: "progress",
                processed,
                total: files.length,
                deleted,
                failed,
              };
              controller.enqueue(
                encoder.encode(JSON.stringify(update) + "\n")
              );
            }
          }

          // Send completion
          const complete = {
            type: "complete",
            deleted,
            failed,
          };
          controller.enqueue(encoder.encode(JSON.stringify(complete) + "\n"));
          controller.close();
        },
      });

      return new Response(streamResponse, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Non-streaming fallback
    let deleted = 0;
    let failed = 0;

    for (const file of files) {
      try {
        // Get library path
        const libraryPath = libraryPathMap.get(file.libraryId);
        if (!libraryPath) {
          console.error(
            `[ResetAllMetadata] Library not found for file ${file.fileName}`
          );
          failed++;
          continue;
        }

        // Delete filesystem metadata files
        const fullPath = path.join(libraryPath, file.filePath);
        await deleteMetadataFiles(fullPath);

        // Clear database Seerr fields
        await db
          .update(mediaFiles)
          .set({
            seerrVerified: false,
            seerrTitle: null,
            seerrYear: null,
            seerrTmdbId: null,
            seerrOverview: null,
            seerrPosterPath: null,
            seerrBackdropPath: null,
            seerrVoteAverage: null,
            seerrMatchScore: null,
            seerrCast: null,
            updatedAt: new Date(),
          })
          .where(eq(mediaFiles.id, file.id));

        deleted++;
      } catch (error) {
        failed++;
        console.error(
          `[ResetAllMetadata] Failed to reset ${file.fileName}:`,
          error
        );
      }
    }

    return NextResponse.json({
      success: true,
      deleted,
      failed,
      message: `Reset ${deleted} files across ${libraries.length} libraries. ${failed} failed.`,
    });
  } catch (error) {
    console.error("Error resetting all metadata:", error);
    return NextResponse.json(
      { error: "Failed to reset all metadata" },
      { status: 500 }
    );
  }
}
