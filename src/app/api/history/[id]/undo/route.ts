import { NextRequest, NextResponse } from "next/server";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { renameHistoryService } from "@/src/lib/rename-history";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/history/[id]/undo - Check if undo is possible
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await renameHistoryService.canUndo(id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error checking undo status:", error);
    return NextResponse.json(
      { error: "Failed to check undo status" },
      { status: 500 }
    );
  }
}

// POST /api/history/[id]/undo - Undo a rename operation
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const result = await renameHistoryService.undoRename(id, session.user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to undo" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      filesRestored: result.filesRestored,
    });
  } catch (error) {
    console.error("Error undoing rename:", error);
    return NextResponse.json(
      { error: "Failed to undo rename" },
      { status: 500 }
    );
  }
}
