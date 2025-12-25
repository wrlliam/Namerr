/**
 * User Detail API
 * Update and delete users (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { users, account, session } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";

interface Params {
  id: string;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const userSession = await getSessionWithRole();

  if (!userSession?.user || userSession.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { role } = body;

    if (!role || !["user", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "Valid role is required" },
        { status: 400 }
      );
    }

    // Prevent self-demotion
    if (id === userSession.user.id) {
      return NextResponse.json(
        { error: "You cannot change your own role" },
        { status: 400 }
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, id));

    return NextResponse.json({
      success: true,
      message: "User role updated successfully",
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  const { getSessionWithRole } = await import("@/src/lib/auth-helpers");
  const userSession = await getSessionWithRole();

  if (!userSession?.user || userSession.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    // Prevent self-deletion
    if (id === userSession.user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete user (cascades to sessions and accounts)
    await db.delete(users).where(eq(users.id, id));

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}
