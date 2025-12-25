/**
 * SSH Host Detail API
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { sshHosts } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { updateSshHostSchema } from "@/src/lib/validation/ssh-hosts";
import { encrypt } from "@/src/lib/crypto";
import { ZodError } from "zod";

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

    const [host] = await db
      .select()
      .from(sshHosts)
      .where(eq(sshHosts.id, id))
      .limit(1);

    if (!host) {
      return NextResponse.json({ error: "SSH host not found" }, { status: 404 });
    }

    // Don't return sensitive fields
    const { password, privateKey, passphrase, ...safeHost } = host;

    return NextResponse.json({ host: safeHost });
  } catch (error) {
    console.error("Error fetching SSH host:", error);
    return NextResponse.json(
      { error: "Failed to fetch SSH host" },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
    const body = await request.json();

    // Validate input with Zod
    const validatedData = updateSshHostSchema.parse(body);

    // Build update object
    const updateData: Record<string, unknown> = {};

    if (validatedData.name !== undefined) updateData.name = validatedData.name;
    if (validatedData.hostname !== undefined) updateData.hostname = validatedData.hostname;
    if (validatedData.port !== undefined) updateData.port = validatedData.port;
    if (validatedData.username !== undefined) updateData.username = validatedData.username;
    if (validatedData.authMethod !== undefined) updateData.authMethod = validatedData.authMethod;
    if (validatedData.workingDirectory !== undefined)
      updateData.workingDirectory = validatedData.workingDirectory;
    if (validatedData.enabled !== undefined) updateData.enabled = validatedData.enabled;

    // Encrypt sensitive fields if provided
    if (validatedData.password !== undefined) {
      updateData.password = encrypt(validatedData.password) as any;
    }
    if (validatedData.privateKey !== undefined) {
      updateData.privateKey = encrypt(validatedData.privateKey) as any;
    }
    if (validatedData.passphrase !== undefined) {
      updateData.passphrase = encrypt(validatedData.passphrase) as any;
    }

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(sshHosts)
      .set(updateData)
      .where(eq(sshHosts.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "SSH host not found" }, { status: 404 });
    }

    // Don't return sensitive fields
    const { password, privateKey, passphrase, ...safeHost } = updated;

    return NextResponse.json({ host: safeHost });
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    console.error("Error updating SSH host:", error);
    return NextResponse.json(
      { error: "Failed to update SSH host" },
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

    await db.delete(sshHosts).where(eq(sshHosts.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting SSH host:", error);
    return NextResponse.json(
      { error: "Failed to delete SSH host" },
      { status: 500 }
    );
  }
}
