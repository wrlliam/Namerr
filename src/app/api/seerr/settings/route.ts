import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { seerrSettings, users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is admin
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const [settings] = await db
      .select()
      .from(seerrSettings)
      .orderBy(seerrSettings.id)
      .limit(1);

    if (!settings) {
      return NextResponse.json({
        apiUrl: null,
        apiKey: null,
        connectionStatus: null,
        lastTestedAt: null,
      });
    }

    // Don't send the full API key, just indicate if it's set
    return NextResponse.json({
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey ? "***" : null,
      connectionStatus: settings.connectionStatus,
      lastTestedAt: settings.lastTestedAt,
    });
  } catch (error) {
    console.error("Error fetching Seerr settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user is admin
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { apiUrl, apiKey } = body;

    // Validate inputs
    if (!apiUrl || !apiKey) {
      return NextResponse.json(
        { error: "API URL and API key are required" },
        { status: 400 }
      );
    }

    // Check if settings exist
    const [existingSettings] = await db
      .select()
      .from(seerrSettings)
      .orderBy(seerrSettings.id)
      .limit(1);

    if (existingSettings) {
      // Update existing settings
      const [updated] = await db
        .update(seerrSettings)
        .set({
          apiUrl,
          apiKey,
          connectionStatus: "disconnected",
          updatedAt: new Date(),
        })
        .where(eq(seerrSettings.id, existingSettings.id))
        .returning();

      return NextResponse.json({
        apiUrl: updated.apiUrl,
        apiKey: "***",
        connectionStatus: updated.connectionStatus,
      });
    } else {
      // Create new settings
      const [created] = await db
        .insert(seerrSettings)
        .values({
          apiUrl,
          apiKey,
          connectionStatus: "disconnected",
        })
        .returning();

      return NextResponse.json({
        apiUrl: created.apiUrl,
        apiKey: "***",
        connectionStatus: created.connectionStatus,
      });
    }
  } catch (error) {
    console.error("Error updating Seerr settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
