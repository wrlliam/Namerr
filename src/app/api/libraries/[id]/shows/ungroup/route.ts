import { NextRequest, NextResponse } from "next/server";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { db } from "@/src/lib/db";
import { mediaFiles, mediaLibraries } from "@/src/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/libraries/[id]/shows/ungroup - Remove manual grouping from files
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
    const { fileIds } = body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return NextResponse.json(
        { error: "fileIds must be a non-empty array" },
        { status: 400 }
      );
    }

    // Clear manual show group for all specified files
    const result = await db
      .update(mediaFiles)
      .set({
        manualShowGroup: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(mediaFiles.libraryId, id), inArray(mediaFiles.id, fileIds))
      );

    return NextResponse.json({
      success: true,
      message: `Removed manual grouping from ${fileIds.length} files`,
    });
  } catch (error) {
    console.error("Error ungrouping show:", error);
    return NextResponse.json(
      { error: "Failed to ungroup show" },
      { status: 500 }
    );
  }
}
