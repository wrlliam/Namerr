// Runs once when the Next.js server starts (Node runtime only)
export const runtime = "nodejs";

export async function register() {
  if (typeof process === "undefined" || process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  // Keep instrumentation lightweight to avoid Edge runtime imports.
  // Admin creation is handled via /api/admin/init or the seed script.
  const DEFAULT_ADMIN_EMAIL = "admin@letters.app";
  const DEFAULT_ADMIN_PASSWORD = "admin123";

  console.log("\n" + "=".repeat(50));
  console.log("🔐 DEFAULT ADMIN CREDENTIALS");
  console.log("=".repeat(50));
  console.log(`Email: ${DEFAULT_ADMIN_EMAIL}`);
  console.log(`Password: ${DEFAULT_ADMIN_PASSWORD}`);
  console.log("=".repeat(50));
  console.log("Note: Run 'bun run db:push' if you see database errors");
  console.log("=".repeat(50) + "\n");
}

