import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workerJobLogs, mediaFiles } from "@/src/lib/db/schema";
import { eq, desc } from "drizzle-orm";

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
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const logs = await db
      .select({
        id: workerJobLogs.id,
        operation: workerJobLogs.operation,
        status: workerJobLogs.status,
        oldPath: workerJobLogs.oldPath,
        newPath: workerJobLogs.newPath,
        errorMessage: workerJobLogs.errorMessage,
        executionTimeMs: workerJobLogs.executionTimeMs,
        createdAt: workerJobLogs.createdAt,
        mediaFileId: workerJobLogs.mediaFileId,
        fileName: mediaFiles.fileName,
      })
      .from(workerJobLogs)
      .leftJoin(mediaFiles, eq(workerJobLogs.mediaFileId, mediaFiles.id))
      .where(eq(workerJobLogs.jobId, id))
      .orderBy(desc(workerJobLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Error fetching job logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch logs" },
      { status: 500 }
    );
  }
}
