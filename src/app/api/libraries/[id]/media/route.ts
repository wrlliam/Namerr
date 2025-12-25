import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaLibraries, mediaFiles } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq, and, ilike, sql } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/libraries/[id]/media - Get media files for a library
export async function GET(request: NextRequest, { params }: RouteParams) {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const offset = (page - 1) * limit;

    // Build query conditions
    const mediaConditions = [eq(mediaFiles.libraryId, id)];

    if (status && status !== "all") {
      mediaConditions.push(eq(mediaFiles.renameStatus, status));
    }

    if (search) {
      mediaConditions.push(ilike(mediaFiles.fileName, `%${search}%`));
    }

    // Get total count
    const [{ count: totalCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaFiles)
      .where(and(...mediaConditions));

    // Get paginated results
    const files = await db
      .select()
      .from(mediaFiles)
      .where(and(...mediaConditions))
      .orderBy(mediaFiles.fileName)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      media: files,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching media files:", error);
    return NextResponse.json(
      { error: "Failed to fetch media files" },
      { status: 500 }
    );
  }
}
