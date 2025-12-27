/**
 * Current User API
 * Get and update current user
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { users, account } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcryptjs";
import { validatePassword } from "@/src/lib/password-validation";

export async function GET(request: NextRequest) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error fetching current user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const session = await getSessionWithRole();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { email, currentPassword, newPassword } = body;

    // Update email if provided (no password required)
    if (email) {
      // Check if email already exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser && existingUser.id !== session.user.id) {
        return NextResponse.json(
          { error: "Email already in use" },
          { status: 400 }
        );
      }

      await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.id, session.user.id));
    }

    // Update password if provided (requires current password)
    if (newPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required to change password" },
          { status: 400 }
        );
      }

      // Get user's account with password (filter by credential provider)
      // Try both "credential" and "email" provider IDs as better-auth may use either
      const accounts = await db
        .select()
        .from(account)
        .where(eq(account.userId, session.user.id));

      console.log(`Found ${accounts.length} account(s) for user:`, session.user.id);

      if (accounts.length === 0) {
        console.error("No account found for user:", session.user.id);
        return NextResponse.json(
          { error: "User account not found" },
          { status: 400 }
        );
      }

      // Try to find the account with a password (prefer "credential" or "email" provider)
      let userAccount = accounts.find(a => a.password) || accounts[0];

      console.log("Using account with providerId:", userAccount.providerId);
      console.log("Has password:", !!userAccount.password);

      if (!userAccount.password) {
        console.error("No password set for account:", userAccount.id);
        return NextResponse.json(
          { error: "No password set for this account" },
          { status: 400 }
        );
      }

      // Verify current password
      console.log("Verifying password for user:", session.user.id);
      console.log("Current password length:", currentPassword.length);
      console.log("Stored hash starts with:", userAccount.password.substring(0, 10));

      const isValidPassword = await bcrypt.compare(
        currentPassword,
        userAccount.password
      );

      if (!isValidPassword) {
        console.error("Password verification failed for user:", session.user.id);
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }

      // Validate new password strength
      const validation = validatePassword(newPassword);
      if (!validation.isValid) {
        return NextResponse.json(
          { error: validation.errors.join(". ") },
          { status: 400 }
        );
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db
        .update(account)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(account.userId, session.user.id));

      console.log("Password updated successfully for user:", session.user.id);
    }

    return NextResponse.json({
      success: true,
      message: "Account updated successfully",
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}
