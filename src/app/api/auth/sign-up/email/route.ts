import { NextResponse } from "next/server";

// Block public signup - users can only be created by admins via /api/admin/users
export async function POST() {
  return NextResponse.json(
    { error: "Public signup is disabled. Please contact an administrator to create an account." },
    { status: 403 }
  );
}

