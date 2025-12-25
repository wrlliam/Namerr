import { NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/src/lib/auth";
import { headers } from "next/headers";

const DEFAULT_ADMIN_EMAIL = "admin@letters.app";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_ADMIN_NAME = "Admin";

export async function GET() {
  try {
    // Check if admin user already exists
    let existingAdmin;
    try {
      existingAdmin = await db
        .select()
        .from(users)
        .where(eq(users.email, DEFAULT_ADMIN_EMAIL))
        .limit(1);
    } catch (error: any) {
      // If table doesn't exist, return helpful error
      if (error.message?.includes("no such table")) {
        return NextResponse.json({
          error: "Database tables not found. Please run 'bun run db:push' to create them.",
          email: DEFAULT_ADMIN_EMAIL,
          password: DEFAULT_ADMIN_PASSWORD,
          needsSetup: true,
        }, { status: 500 });
      }
      throw error;
    }

    if (existingAdmin.length > 0) {
      return NextResponse.json({
        exists: true,
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        message: "Default admin user already exists",
      });
    }

    // Create default admin user
    try {
      const signUpResult = await auth.api.signUpEmail({
        body: {
          email: DEFAULT_ADMIN_EMAIL,
          password: DEFAULT_ADMIN_PASSWORD,
          name: DEFAULT_ADMIN_NAME,
        },
        headers: await headers(),
      });

      if (signUpResult?.user) {
        // Set role to admin
        await db
          .update(users)
          .set({ role: "admin" })
          .where(eq(users.id, signUpResult.user.id));

        return NextResponse.json({
          created: true,
          email: DEFAULT_ADMIN_EMAIL,
          password: DEFAULT_ADMIN_PASSWORD,
          message: "Default admin user created",
        });
      }
    } catch (error: any) {
      // User might already exist from better-auth
      if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
        // Try to update existing user to admin
        const existing = await db
          .select()
          .from(users)
          .where(eq(users.email, DEFAULT_ADMIN_EMAIL))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(users)
            .set({ role: "admin" })
            .where(eq(users.id, existing[0].id));

          return NextResponse.json({
            updated: true,
            email: DEFAULT_ADMIN_EMAIL,
            password: DEFAULT_ADMIN_PASSWORD,
            message: "Existing user updated to admin",
          });
        }
      }
      throw error;
    }

    return NextResponse.json({
      error: "Failed to create admin user",
    }, { status: 500 });
  } catch (error: any) {
    console.error("Error initializing admin:", error);
    
    // Always return credentials even on error
    const response: any = {
      error: error.message || "Internal server error",
      email: DEFAULT_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
    };
    
    if (error.message?.includes("no such table")) {
      response.needsSetup = true;
      response.error = "Database tables not found. Please run 'bun run db:push' to create them.";
    }
    
    return NextResponse.json(response, { status: 500 });
  }
}

