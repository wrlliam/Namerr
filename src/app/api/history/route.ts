import { NextRequest, NextResponse } from "next/server";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { renameHistoryService } from "@/src/lib/rename-history";

// GET /api/history - Get recent rename history
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const libraryId = searchParams.get("libraryId");

    let result;
    if (libraryId) {
      result = await renameHistoryService.getLibraryHistory(libraryId, {
        limit,
        offset,
      });
    } else {
      result = await renameHistoryService.getRecentHistory({
        limit,
        offset,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching history:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
