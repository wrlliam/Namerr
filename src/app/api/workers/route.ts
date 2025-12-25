/**
 * Workers Management API
 * List and spawn workers
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workerInstances, sshHosts } from "@/src/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { spawnLocalWorker, spawnRemoteWorker } from "@/src/lib/worker-manager";

export async function GET(request: NextRequest) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const workers = await db
      .select()
      .from(workerInstances)
      .orderBy(desc(workerInstances.lastHeartbeat));

    // Check for stale workers (no heartbeat in 30 seconds)
    const now = new Date();
    const workersWithStatus = workers.map((worker) => {
      const isStale =
        worker.lastHeartbeat &&
        now.getTime() - new Date(worker.lastHeartbeat).getTime() > 30000;

      return {
        ...worker,
        isHealthy: worker.status === "running" && !isStale,
        isStale,
      };
    });

    return NextResponse.json({ workers: workersWithStatus });
  } catch (error) {
    console.error("Error fetching workers:", error);
    return NextResponse.json(
      { error: "Failed to fetch workers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, sshHostId, name } = body;

    if (type !== "local" && type !== "remote") {
      return NextResponse.json(
        { error: "Invalid worker type" },
        { status: 400 }
      );
    }

    if (type === "local") {
      // Create worker instance in database first
      const [worker] = await db
        .insert(workerInstances)
        .values({
          name: name || "Local Worker",
          type: "local",
          status: "starting",
          hostname: "localhost",
        })
        .returning();

      // Spawn local worker process
      const result = await spawnLocalWorker(worker.id, worker.name);

      if (!result.success) {
        // Update status to error
        await db
          .update(workerInstances)
          .set({ status: "error" })
          .where(eq(workerInstances.id, worker.id));

        return NextResponse.json(
          { error: result.error || "Failed to spawn worker" },
          { status: 500 }
        );
      }

      // Update with PID
      if (result.pid) {
        await db
          .update(workerInstances)
          .set({ pid: result.pid })
          .where(eq(workerInstances.id, worker.id));
      }

      return NextResponse.json({
        worker: {
          ...worker,
          pid: result.pid,
        },
      }, { status: 201 });
    } else {
      // Spawn remote worker via SSH
      if (!sshHostId) {
        return NextResponse.json(
          { error: "SSH host ID is required for remote workers" },
          { status: 400 }
        );
      }

      // Get SSH host to retrieve hostname
      const [sshHost] = await db
        .select()
        .from(sshHosts)
        .where(eq(sshHosts.id, sshHostId))
        .limit(1);

      if (!sshHost) {
        return NextResponse.json(
          { error: "SSH host not found" },
          { status: 404 }
        );
      }

      // Create worker instance in database first
      const [worker] = await db
        .insert(workerInstances)
        .values({
          name: name || "Remote Worker",
          type: "remote",
          status: "starting",
          hostname: sshHost.hostname,
          sshHostId: sshHostId,
        })
        .returning();

      // Spawn remote worker via SSH
      const result = await spawnRemoteWorker(worker.id, worker.name, sshHostId);

      if (!result.success) {
        // Update status to error
        await db
          .update(workerInstances)
          .set({ status: "error" })
          .where(eq(workerInstances.id, worker.id));

        return NextResponse.json(
          { error: result.error || "Failed to spawn remote worker" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        worker,
      }, { status: 201 });
    }
  } catch (error) {
    console.error("Error spawning worker:", error);
    return NextResponse.json(
      { error: "Failed to spawn worker" },
      { status: 500 }
    );
  }
}
