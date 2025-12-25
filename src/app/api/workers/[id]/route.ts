/**
 * Worker Instance Detail API
 * Get details and kill workers
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workerInstances } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { terminateWorker, terminateRemoteWorker } from "@/src/lib/worker-manager";

interface Params {
  id: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    const [worker] = await db
      .select()
      .from(workerInstances)
      .where(eq(workerInstances.id, id))
      .limit(1);

    if (!worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    return NextResponse.json({ worker });
  } catch (error) {
    console.error("Error fetching worker:", error);
    return NextResponse.json(
      { error: "Failed to fetch worker" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    const [worker] = await db
      .select()
      .from(workerInstances)
      .where(eq(workerInstances.id, id))
      .limit(1);

    if (!worker) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    if (worker.type === "local") {
      // Terminate local worker process
      const result = await terminateWorker(id, worker.pid);

      // Delete from database
      await db
        .delete(workerInstances)
        .where(eq(workerInstances.id, id));

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: "Worker terminated and removed successfully",
        });
      } else {
        return NextResponse.json({
          success: false,
          message: `Worker removed from database, but process termination may have failed: ${result.error}`,
        });
      }
    } else {
      // Terminate remote worker via SSH
      const result = await terminateRemoteWorker(id, worker.sshHostId);

      // Delete from database
      await db
        .delete(workerInstances)
        .where(eq(workerInstances.id, id));

      if (result.success) {
        return NextResponse.json({
          success: true,
          message: "Remote worker terminated and removed successfully",
        });
      } else {
        return NextResponse.json({
          success: false,
          message: `Worker removed from database, but remote termination may have failed: ${result.error}`,
        });
      }
    }
  } catch (error) {
    console.error("Error killing worker:", error);
    return NextResponse.json(
      { error: "Failed to kill worker" },
      { status: 500 }
    );
  }
}
