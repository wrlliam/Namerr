import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { mediaLibraries } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq } from "drizzle-orm";
import { isValidMediaDirectory } from "@/src/lib/file-scanner";

// GET /api/libraries - List all libraries for the current user
export async function GET() {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = session.user.role === "admin";

    // Admins can see all libraries, users only see their own
    const libraries = await db
      .select()
      .from(mediaLibraries)
      .where(isAdmin ? undefined : eq(mediaLibraries.userId, session.user.id))
      .orderBy(mediaLibraries.createdAt);

    return NextResponse.json({ libraries });
  } catch (error) {
    console.error("Error fetching libraries:", error);
    return NextResponse.json(
      { error: "Failed to fetch libraries" },
      { status: 500 }
    );
  }
}

// POST /api/libraries - Create a new library
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, path, label, type } = body;

    // Validate required fields
    if (!name || !path || !label || !type) {
      return NextResponse.json(
        { error: "Missing required fields: name, path, label, type" },
        { status: 400 }
      );
    }

    // Validate type
    if (!["movie", "tv"].includes(type)) {
      return NextResponse.json(
        { error: "Type must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    // Validate the path exists and is accessible
    const pathValidation = await isValidMediaDirectory(path);
    if (!pathValidation.valid) {
      return NextResponse.json(
        { error: `Invalid path: ${pathValidation.error}` },
        { status: 400 }
      );
    }

    // Create the library
    const [library] = await db
      .insert(mediaLibraries)
      .values({
        userId: session.user.id,
        name,
        path,
        label,
        type,
        enabled: true,
        scanStatus: "idle",
      })
      .returning();

    return NextResponse.json({ library }, { status: 201 });
  } catch (error) {
    console.error("Error creating library:", error);
    return NextResponse.json(
      { error: "Failed to create library" },
      { status: 500 }
    );
  }
}
