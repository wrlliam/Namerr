import { NextRequest, NextResponse } from "next/server";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { db } from "@/src/lib/db";
import { librarySettings, mediaLibraries } from "@/src/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/libraries/[id]/settings - Fetch library settings
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

    // Get or create settings
    let [settings] = await db
      .select()
      .from(librarySettings)
      .where(eq(librarySettings.libraryId, id))
      .limit(1);

    if (!settings) {
      // Create default settings
      [settings] = await db
        .insert(librarySettings)
        .values({
          libraryId: id,
          autoMetadataOnScan: true,
          matchConfidenceThreshold: "0.80",
        })
        .returning();
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching library settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch library settings" },
      { status: 500 }
    );
  }
}

// PATCH /api/libraries/[id]/settings - Update library settings
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

    const [library] = await db
      .select()
      .from(mediaLibraries)
      .where(and(...conditions))
      .limit(1);

    if (!library) {
      return NextResponse.json({ error: "Library not found" }, { status: 404 });
    }

    const body = await request.json();
    const { autoMetadataOnScan, matchConfidenceThreshold } = body;

    // Validate threshold
    if (matchConfidenceThreshold !== undefined) {
      const threshold =
        typeof matchConfidenceThreshold === "string"
          ? parseFloat(matchConfidenceThreshold)
          : matchConfidenceThreshold;

      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        return NextResponse.json(
          { error: "Match threshold must be between 0 and 1" },
          { status: 400 }
        );
      }
    }

    // Update or insert settings
    const [existing] = await db
      .select()
      .from(librarySettings)
      .where(eq(librarySettings.libraryId, id))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(librarySettings)
        .set({
          ...(autoMetadataOnScan !== undefined && { autoMetadataOnScan }),
          ...(matchConfidenceThreshold !== undefined && {
            matchConfidenceThreshold:
              typeof matchConfidenceThreshold === "string"
                ? matchConfidenceThreshold
                : matchConfidenceThreshold.toString(),
          }),
          updatedAt: new Date(),
        })
        .where(eq(librarySettings.id, existing.id))
        .returning();

      return NextResponse.json(updated);
    } else {
      const [created] = await db
        .insert(librarySettings)
        .values({
          libraryId: id,
          autoMetadataOnScan:
            autoMetadataOnScan !== undefined ? autoMetadataOnScan : true,
          matchConfidenceThreshold:
            matchConfidenceThreshold !== undefined
              ? typeof matchConfidenceThreshold === "string"
                ? matchConfidenceThreshold
                : matchConfidenceThreshold.toString()
              : "0.80",
        })
        .returning();

      return NextResponse.json(created);
    }
  } catch (error) {
    console.error("Error updating library settings:", error);
    return NextResponse.json(
      { error: "Failed to update library settings" },
      { status: 500 }
    );
  }
}
