import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { systemConfig, users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
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
    // Get worker parallelism config
    const [parallelismConfig] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "worker_parallelism"))
      .limit(1);

    // Get dry run mode config
    const [dryRunConfig] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, "dry_run_mode"))
      .limit(1);

    const parallelism = parallelismConfig?.value
      ? Number((parallelismConfig.value as { parallelism?: number }).parallelism || 4)
      : 4;

    const dryRun = dryRunConfig?.value
      ? Boolean((dryRunConfig.value as { enabled?: boolean }).enabled)
      : true;

    return NextResponse.json({
      parallelism,
      dryRun,
    });
  } catch (error) {
    console.error("Error fetching worker config:", error);
    return NextResponse.json(
      { error: "Failed to fetch config" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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
    const { parallelism, dryRun } = body;

    // Validate parallelism
    if (parallelism !== undefined) {
      const parallelismNum = Number(parallelism);
      if (isNaN(parallelismNum) || parallelismNum < 1 || parallelismNum > 20) {
        return NextResponse.json(
          { error: "Parallelism must be between 1 and 20" },
          { status: 400 }
        );
      }

      // Update or insert parallelism config
      const [existingParallelism] = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, "worker_parallelism"))
        .limit(1);

      if (existingParallelism) {
        await db
          .update(systemConfig)
          .set({
            value: { parallelism: parallelismNum },
            updatedAt: new Date(),
          })
          .where(eq(systemConfig.key, "worker_parallelism"));
      } else {
        await db.insert(systemConfig).values({
          key: "worker_parallelism",
          value: { parallelism: parallelismNum },
        });
      }
    }

    // Update dry run mode
    if (dryRun !== undefined) {
      const [existingDryRun] = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, "dry_run_mode"))
        .limit(1);

      if (existingDryRun) {
        await db
          .update(systemConfig)
          .set({
            value: { enabled: Boolean(dryRun) },
            updatedAt: new Date(),
          })
          .where(eq(systemConfig.key, "dry_run_mode"));
      } else {
        await db.insert(systemConfig).values({
          key: "dry_run_mode",
          value: { enabled: Boolean(dryRun) },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating worker config:", error);
    return NextResponse.json(
      { error: "Failed to update config" },
      { status: 500 }
    );
  }
}
