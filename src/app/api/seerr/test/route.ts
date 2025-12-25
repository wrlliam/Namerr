import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { seerrSettings, users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { SeerrClient } from "@/src/lib/seerr-client";

export async function POST(request: NextRequest) {
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

    if (!apiUrl || !apiKey) {
      return NextResponse.json(
        { error: "API URL and API key are required" },
        { status: 400 }
      );
    }

    // Test the connection
    const client = new SeerrClient(apiKey, apiUrl);
    const result = await client.testConnection();

    if (result.success) {
      // Update connection status in database
      const [existingSettings] = await db
        .select()
        .from(seerrSettings)
        .orderBy(seerrSettings.id)
        .limit(1);

      if (existingSettings) {
        await db
          .update(seerrSettings)
          .set({
            connectionStatus: "connected",
            lastTestedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(seerrSettings.id, existingSettings.id));
      }

      return NextResponse.json({
        success: true,
        version: result.version,
      });
    } else {
      // Update connection status to error
      const [existingSettings] = await db
        .select()
        .from(seerrSettings)
        .orderBy(seerrSettings.id)
        .limit(1);

      if (existingSettings) {
        await db
          .update(seerrSettings)
          .set({
            connectionStatus: "error",
            lastTestedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(seerrSettings.id, existingSettings.id));
      }

      return NextResponse.json(
        {
          success: false,
          error: result.error || "Connection failed",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error testing Seerr connection:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Connection test failed",
      },
      { status: 500 }
    );
  }
}
