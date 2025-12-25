import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaLibraries, mediaFiles } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq, and, count } from "drizzle-orm";
import { isValidMediaDirectory } from "@/src/lib/file-scanner";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/libraries/[id] - Get a specific library
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const isAdmin = session.user.role === "admin";

    // Build query conditions
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

    // Get media file counts by status
    const fileStats = await db
      .select({
        status: mediaFiles.renameStatus,
        count: count(),
      })
      .from(mediaFiles)
      .where(eq(mediaFiles.libraryId, id))
      .groupBy(mediaFiles.renameStatus);

    const statusCounts = fileStats.reduce(
      (acc, { status, count }) => {
        if (status) {
          acc[status] = Number(count);
        }
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      library,
      stats: {
        totalFiles: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        ...statusCounts,
      },
    });
  } catch (error) {
    console.error("Error fetching library:", error);
    return NextResponse.json(
      { error: "Failed to fetch library" },
      { status: 500 }
    );
  }
}

// PATCH /api/libraries/[id] - Update a library
export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    const [existingLibrary] = await db
      .select()
      .from(mediaLibraries)
      .where(and(...conditions))
      .limit(1);

    if (!existingLibrary) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, label, path, type, enabled } = body;

    // If path is being changed, validate it
    if (path && path !== existingLibrary.path) {
      const pathValidation = await isValidMediaDirectory(path);
      if (!pathValidation.valid) {
        return NextResponse.json(
          { error: `Invalid path: ${pathValidation.error}` },
          { status: 400 }
        );
      }
    }

    // Build update object with only provided fields
    const updateData: Partial<typeof existingLibrary> = {};
    if (name !== undefined) updateData.name = name;
    if (label !== undefined) updateData.label = label;
    if (path !== undefined) updateData.path = path;
    if (type !== undefined && ["movie", "tv"].includes(type))
      updateData.type = type;
    if (enabled !== undefined) updateData.enabled = enabled;
    updateData.updatedAt = new Date();

    const [updatedLibrary] = await db
      .update(mediaLibraries)
      .set(updateData)
      .where(eq(mediaLibraries.id, id))
      .returning();

    return NextResponse.json({ library: updatedLibrary });
  } catch (error) {
    console.error("Error updating library:", error);
    return NextResponse.json(
      { error: "Failed to update library" },
      { status: 500 }
    );
  }
}

// DELETE /api/libraries/[id] - Delete a library
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const [existingLibrary] = await db
      .select()
      .from(mediaLibraries)
      .where(and(...conditions))
      .limit(1);

    if (!existingLibrary) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }

    // Delete library (cascades to media files due to FK constraint)
    await db.delete(mediaLibraries).where(eq(mediaLibraries.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting library:", error);
    return NextResponse.json(
      { error: "Failed to delete library" },
      { status: 500 }
    );
  }
}
