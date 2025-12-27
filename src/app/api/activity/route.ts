import { NextRequest, NextResponse } from "next/server";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { statisticsService } from "@/src/lib/statistics-service";

// GET /api/activity - Get recent activity
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50");
    const libraryId = searchParams.get("libraryId") || undefined;

    const activities = await statisticsService.getRecentActivity({
      limit,
      libraryId,
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error("Error fetching activity:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
