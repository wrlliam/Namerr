import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { duplicateExclusions, mediaFiles } from "@/src/lib/db/schema";
import { eq, and, or, sql } from "drizzle-orm";

/**
 * POST /api/duplicates/exclude - Mark pair as non-duplicate
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fileId1, fileId2 } = body as { fileId1: string; fileId2: string };

    if (!fileId1 || !fileId2) {
      return NextResponse.json(
        { error: "fileId1 and fileId2 are required" },
        { status: 400 }
      );
    }

    if (fileId1 === fileId2) {
      return NextResponse.json(
        { error: "Cannot exclude a file with itself" },
        { status: 400 }
      );
    }

    // Verify both files exist
    const files = await db
      .select({ id: mediaFiles.id })
      .from(mediaFiles)
      .where(
        or(eq(mediaFiles.id, fileId1), eq(mediaFiles.id, fileId2))
      );

    if (files.length !== 2) {
      return NextResponse.json(
        { error: "One or both files not found" },
        { status: 404 }
      );
    }

    // Normalize order (smaller ID first) for consistent storage
    const [id1, id2] = fileId1 < fileId2 ? [fileId1, fileId2] : [fileId2, fileId1];

    // Check if exclusion already exists
    const existing = await db
      .select()
      .from(duplicateExclusions)
      .where(
        and(
          eq(duplicateExclusions.fileId1, id1),
          eq(duplicateExclusions.fileId2, id2)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json({
        success: true,
        message: "Pair already marked as non-duplicate",
        exclusionId: existing[0].id,
      });
    }

    // Create exclusion
    const [exclusion] = await db
      .insert(duplicateExclusions)
      .values({
        fileId1: id1,
        fileId2: id2,
        excludedBy: session.user.id,
      })
      .returning();

    return NextResponse.json({
      success: true,
      exclusionId: exclusion.id,
    });
  } catch (error) {
    console.error("Error creating exclusion:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create exclusion",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/duplicates/exclude - Remove exclusion
 */
export async function DELETE(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { fileId1, fileId2, exclusionId } = body as {
      fileId1?: string;
      fileId2?: string;
      exclusionId?: string;
    };

    if (exclusionId) {
      // Delete by exclusion ID
      await db
        .delete(duplicateExclusions)
        .where(eq(duplicateExclusions.id, exclusionId));
    } else if (fileId1 && fileId2) {
      // Delete by file pair (handle both orderings)
      await db
        .delete(duplicateExclusions)
        .where(
          or(
            and(
              eq(duplicateExclusions.fileId1, fileId1),
              eq(duplicateExclusions.fileId2, fileId2)
            ),
            and(
              eq(duplicateExclusions.fileId1, fileId2),
              eq(duplicateExclusions.fileId2, fileId1)
            )
          )
        );
    } else {
      return NextResponse.json(
        { error: "Either exclusionId or both fileId1 and fileId2 are required" },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing exclusion:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to remove exclusion",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/duplicates/exclude - Get all exclusions for a file
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      // Return all exclusions
      const exclusions = await db.select().from(duplicateExclusions);
      return NextResponse.json({ exclusions });
    }

    // Return exclusions for specific file
    const exclusions = await db
      .select()
      .from(duplicateExclusions)
      .where(
        or(
          eq(duplicateExclusions.fileId1, fileId),
          eq(duplicateExclusions.fileId2, fileId)
        )
      );

    return NextResponse.json({ exclusions });
  } catch (error) {
    console.error("Error fetching exclusions:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch exclusions",
      },
      { status: 500 }
    );
  }
}
