import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaLibraries } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/libraries/[id]/watch - Get watch status
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
      .select({
        id: mediaLibraries.id,
        watchEnabled: mediaLibraries.watchEnabled,
        watchDebounceMs: mediaLibraries.watchDebounceMs,
      })
      .from(mediaLibraries)
      .where(and(...conditions))
      .limit(1);

    if (!library) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }

    return NextResponse.json({
      enabled: library.watchEnabled || false,
      debounceMs: library.watchDebounceMs || 30000,
    });
  } catch (error) {
    console.error("Error fetching watch status:", error);
    return NextResponse.json(
      { error: "Failed to fetch watch status" },
      { status: 500 }
    );
  }
}

// POST /api/libraries/[id]/watch - Enable/disable watch
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
    const { enabled, debounceMs } = body;

    // Update library
    await db
      .update(mediaLibraries)
      .set({
        watchEnabled: enabled ?? library.watchEnabled,
        watchDebounceMs: debounceMs ?? library.watchDebounceMs,
        updatedAt: new Date(),
      })
      .where(eq(mediaLibraries.id, id));

    return NextResponse.json({
      success: true,
      enabled: enabled ?? library.watchEnabled,
      debounceMs: debounceMs ?? library.watchDebounceMs,
    });
  } catch (error) {
    console.error("Error updating watch status:", error);
    return NextResponse.json(
      { error: "Failed to update watch status" },
      { status: 500 }
    );
  }
}
