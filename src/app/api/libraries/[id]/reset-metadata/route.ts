/**
 * Reset metadata API route
 * Deletes .namerr-metadata files from filesystem and clears Seerr metadata from database
 * Supports streaming progress updates via NDJSON
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaLibraries, mediaFiles } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq, and } from "drizzle-orm";
import { deleteMetadataFiles } from "@/src/lib/metadata-file";
import path from "path";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/libraries/[id]/reset-metadata - Reset metadata for all files in library
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

    const body = await request.json();
    const { stream } = body as { stream?: boolean };

    // Get all media files for this library
    const files = await db
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.libraryId, id));

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
              // Delete filesystem metadata files (.namerr-metadata.json, poster, backdrop)
              const fullPath = path.join(library.path, file.filePath);
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
                `[ResetMetadata] Failed to reset ${file.fileName}:`,
                error
              );
            }

            processed++;

            // Send progress update
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
        // Delete filesystem metadata files
        const fullPath = path.join(library.path, file.filePath);
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
          `[ResetMetadata] Failed to reset ${file.fileName}:`,
          error
        );
      }
    }

    return NextResponse.json({
      success: true,
      deleted,
      failed,
      message: `Reset ${deleted} files. ${failed} failed.`,
    });
  } catch (error) {
    console.error("Error resetting metadata:", error);
    return NextResponse.json(
      { error: "Failed to reset metadata" },
      { status: 500 }
    );
  }
}
