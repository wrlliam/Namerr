/**
 * Database connection for worker service
 * Shared PostgreSQL connection pool
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../../src/lib/db/schema";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://mediamanager:mediamanager@localhost:5432/mediamanager",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

export const db = drizzle(pool, { schema });

export async function closeDatabase(): Promise<void> {
  await pool.end();
  console.log("Database connection pool closed");
}
