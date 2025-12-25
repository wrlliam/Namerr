/**
 * SSH Connection Testing API
 * Test SSH connections before saving
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "ssh2";
import { testSshConnectionSchema } from "@/src/lib/validation/ssh-hosts";
import { ZodError } from "zod";

export async function POST(request: NextRequest) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate input
    const validatedData = testSshConnectionSchema.parse(body);

    // Test SSH connection
    const result = await testSshConnection(
      validatedData.hostname,
      validatedData.port,
      validatedData.username,
      validatedData.authMethod,
      validatedData.password || null,
      validatedData.privateKey || null,
      validatedData.passphrase || null,
      validatedData.timeout || 10000
    );

    return NextResponse.json(result);
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

    console.error("Error testing SSH connection:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to test connection",
      },
      { status: 500 }
    );
  }
}

/**
 * Test SSH connection with provided credentials
 */
function testSshConnection(
  hostname: string,
  port: number,
  username: string,
  authMethod: "password" | "key",
  password: string | null,
  privateKey: string | null,
  passphrase: string | null,
  timeout: number
): Promise<{
  success: boolean;
  error?: string;
  message?: string;
  connectionTime?: number;
}> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const conn = new Client();
    let resolved = false;

    conn.on("ready", () => {
      const connectionTime = Date.now() - startTime;
      conn.end();

      if (!resolved) {
        resolved = true;
        resolve({
          success: true,
          message: "SSH connection successful",
          connectionTime,
        });
      }
    });

    conn.on("error", (err) => {
      if (!resolved) {
        resolved = true;

        let errorMessage = err.message;

        // Provide user-friendly error messages
        if (err.message.includes("ECONNREFUSED")) {
          errorMessage = "Connection refused. Please check the hostname and port.";
        } else if (err.message.includes("ENOTFOUND")) {
          errorMessage = "Host not found. Please check the hostname.";
        } else if (err.message.includes("ETIMEDOUT")) {
          errorMessage = "Connection timeout. Please check network connectivity.";
        } else if (err.message.includes("authentication")) {
          errorMessage = "Authentication failed. Please check your credentials.";
        } else if (err.message.includes("All configured authentication methods failed")) {
          errorMessage = "Authentication failed. Please verify your username, password, or SSH key.";
        }

        resolve({
          success: false,
          error: errorMessage,
        });
      }
    });

    // Build SSH config
    const sshConfig: any = {
      host: hostname,
      port: port,
      username: username,
      readyTimeout: timeout,
    };

    if (authMethod === "key" && privateKey) {
      sshConfig.privateKey = privateKey;
      if (passphrase) {
        sshConfig.passphrase = passphrase;
      }
    } else if (authMethod === "password" && password) {
      sshConfig.password = password;
    } else {
      resolve({
        success: false,
        error: "Invalid authentication method or missing credentials",
      });
      return;
    }

    // Connect
    try {
      conn.connect(sshConfig);
    } catch (err) {
      if (!resolved) {
        resolved = true;
        resolve({
          success: false,
          error: err instanceof Error ? err.message : "Failed to initiate connection",
        });
      }
    }

    // Timeout handler
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        conn.end();
        resolve({
          success: false,
          error: `Connection timeout after ${timeout}ms`,
        });
      }
    }, timeout);
  });
}
