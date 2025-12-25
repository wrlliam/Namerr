import { NextResponse } from "next/server";
import { getSessionWithRole } from "@/src/lib/auth-helpers";

export async function GET() {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.json(session);
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

