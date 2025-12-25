/**
 * Current User API
 * Get and update current user
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { users, account } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcryptjs";

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

      // Get user's account with password
      const [userAccount] = await db
        .select()
        .from(account)
        .where(eq(account.userId, session.user.id))
        .limit(1);

      if (!userAccount || !userAccount.password) {
        return NextResponse.json(
          { error: "User account not found or no password set" },
          { status: 400 }
        );
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(
        currentPassword,
        userAccount.password
      );

      if (!isValidPassword) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }

      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await db
        .update(account)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(account.userId, session.user.id));
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
