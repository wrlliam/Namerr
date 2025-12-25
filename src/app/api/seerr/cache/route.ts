/**
 * Seerr Cache Management API
 * Clear and monitor Seerr API cache
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { seerrCache } from "@/src/lib/cache";

export async function GET(request: NextRequest) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await seerrCache.getStats();
    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return NextResponse.json(
      { error: "Failed to get cache stats" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const pattern = searchParams.get("pattern");

    if (pattern) {
      // Clear specific pattern
      await seerrCache.clear(pattern);
      return NextResponse.json({
        success: true,
        message: `Cache cleared for pattern: ${pattern}`,
      });
    } else {
      // Clear all Seerr cache
      await seerrCache.clear();
      return NextResponse.json({
        success: true,
        message: "All Seerr cache cleared",
      });
    }
  } catch (error) {
    console.error("Error clearing cache:", error);
    return NextResponse.json(
      { error: "Failed to clear cache" },
      { status: 500 }
    );
  }
}
