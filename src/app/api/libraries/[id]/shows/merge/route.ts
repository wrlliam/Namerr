import { NextRequest, NextResponse } from "next/server";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { db } from "@/src/lib/db";
import { mediaFiles, mediaLibraries } from "@/src/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/libraries/[id]/shows/merge - Merge one show into another
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
    const { sourceFileIds, targetShowName } = body;

    if (!Array.isArray(sourceFileIds) || sourceFileIds.length === 0) {
      return NextResponse.json(
        { error: "sourceFileIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (!targetShowName || typeof targetShowName !== "string") {
      return NextResponse.json(
        { error: "targetShowName must be a non-empty string" },
        { status: 400 }
      );
    }

    // Update all source files to have the target show group name
    const result = await db
      .update(mediaFiles)
      .set({
        manualShowGroup: targetShowName.trim(),
        updatedAt: new Date(),
      })
      .where(
        and(eq(mediaFiles.libraryId, id), inArray(mediaFiles.id, sourceFileIds))
      );

    return NextResponse.json({
      success: true,
      message: `Merged ${sourceFileIds.length} files into "${targetShowName}"`,
    });
  } catch (error) {
    console.error("Error merging shows:", error);
    return NextResponse.json(
      { error: "Failed to merge shows" },
      { status: 500 }
    );
  }
}
