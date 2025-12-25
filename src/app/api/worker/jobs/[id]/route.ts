import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workerJobs, mediaLibraries } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";

interface Params {
  id: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    const [job] = await db
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
      .where(eq(workerJobs.id, id))
      .limit(1);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    console.error("Error fetching job:", error);
    return NextResponse.json(
      { error: "Failed to fetch job" },
      { status: 500 }
    );
  }
}
