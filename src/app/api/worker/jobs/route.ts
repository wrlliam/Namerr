import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workerJobs, mediaLibraries } from "@/src/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Get jobs with library info
    const jobs = await db
      .select({
        id: workerJobs.id,
        type: workerJobs.type,
        status: workerJobs.status,
        progress: workerJobs.progress,
        totalItems: workerJobs.totalItems,
        processedItems: workerJobs.processedItems,
        errorCount: workerJobs.errorCount,
        dryRun: workerJobs.dryRun,
        startedAt: workerJobs.startedAt,
        completedAt: workerJobs.completedAt,
        createdAt: workerJobs.createdAt,
        libraryId: workerJobs.libraryId,
        libraryName: mediaLibraries.name,
      })
      .from(workerJobs)
      .leftJoin(mediaLibraries, eq(workerJobs.libraryId, mediaLibraries.id))
      .orderBy(desc(workerJobs.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error fetching worker jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
