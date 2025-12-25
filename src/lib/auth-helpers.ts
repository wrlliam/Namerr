import { auth } from "./auth";
import { headers } from "next/headers";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";

export async function getSessionWithRole() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return null;
    }

    // Fetch user role from database
    const user = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    return {
      ...session,
      user: {
        ...session.user,
        role: user[0]?.role || "user",
      },
    };
  } catch (error) {
    console.error("Error getting session:", error);
    return null;
  }
}

export async function requireAdmin() {
  const session = await getSessionWithRole();
  if (!session || session.user.role !== "admin") {
    throw new Error("Unauthorized");
  }
  return session;
}

