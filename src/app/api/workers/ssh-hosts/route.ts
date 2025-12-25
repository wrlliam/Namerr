/**
 * SSH Hosts Management API
 * Manage remote hosts for worker spawning
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { sshHosts } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { createSshHostSchema } from "@/src/lib/validation/ssh-hosts";
import { encrypt, decrypt, type EncryptedData } from "@/src/lib/crypto";
import { ZodError } from "zod";

export async function GET(request: NextRequest) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const hosts = await db
      .select({
        id: sshHosts.id,
        name: sshHosts.name,
        hostname: sshHosts.hostname,
        port: sshHosts.port,
        username: sshHosts.username,
        authMethod: sshHosts.authMethod,
        workingDirectory: sshHosts.workingDirectory,
        enabled: sshHosts.enabled,
        lastConnectionAt: sshHosts.lastConnectionAt,
        connectionStatus: sshHosts.connectionStatus,
        createdAt: sshHosts.createdAt,
      })
      .from(sshHosts);

    return NextResponse.json({ hosts });
  } catch (error) {
    console.error("Error fetching SSH hosts:", error);
    return NextResponse.json(
      { error: "Failed to fetch SSH hosts" },
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

    // Validate input with Zod
    const validatedData = createSshHostSchema.parse(body);

    // Encrypt sensitive fields
    const encryptedPassword = encrypt(validatedData.password);
    const encryptedPrivateKey = encrypt(validatedData.privateKey);
    const encryptedPassphrase = encrypt(validatedData.passphrase);

    // Create SSH host with encrypted credentials
    const [host] = await db
      .insert(sshHosts)
      .values({
        name: validatedData.name,
        hostname: validatedData.hostname,
        port: validatedData.port,
        username: validatedData.username,
        authMethod: validatedData.authMethod,
        password: encryptedPassword as any,
        privateKey: encryptedPrivateKey as any,
        passphrase: encryptedPassphrase as any,
        workingDirectory: validatedData.workingDirectory,
        enabled: validatedData.enabled,
        connectionStatus: "disconnected",
      })
      .returning();

    // Return host without sensitive data
    const { password, privateKey, passphrase, ...safeHost } = host;

    return NextResponse.json({ host: safeHost }, { status: 201 });
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

    console.error("Error creating SSH host:", error);
    return NextResponse.json(
      { error: "Failed to create SSH host" },
      { status: 500 }
    );
  }
}
