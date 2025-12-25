#!/usr/bin/env tsx

import { db, closeDb } from "../src/lib/db";
import {
  users,
  seerrSettings,
  systemConfig,
  cacheSettings,
} from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "../src/lib/auth";

const DEFAULT_ADMIN_EMAIL = "admin@namerr.app";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_ADMIN_NAME = "Admin";

// Default system configuration
const DEFAULT_SYSTEM_CONFIG = {
  worker_parallelism: 4,
  dry_run_mode: true, // Safe default: dry run enabled
  scan_interval_hours: 4,
  conflict_resolution: "skip", // skip, increment, overwrite
  min_file_size_mb: 10,
  skip_samples: true,
  handle_subtitles: true,
};

async function ensureAdminUser() {
  try {
    console.log("Checking for admin user...");

    // Check if admin user exists
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, DEFAULT_ADMIN_EMAIL))
      .limit(1);

    if (existingAdmin.length > 0) {
      // Update role to admin if not already
      if (existingAdmin[0].role !== "admin") {
        await db
          .update(users)
          .set({ role: "admin" })
          .where(eq(users.id, existingAdmin[0].id));
        console.log("Updated existing user to admin role");
      } else {
        console.log("Admin user already exists");
      }

      printCredentials();
      return existingAdmin[0];
    }

    // Create admin user using better-auth
    console.log("Creating admin user...");

    const mockHeaders = new Headers();
    mockHeaders.set("host", "localhost:3000");

    try {
      const signUpResult = await auth.api.signUpEmail({
        body: {
          email: DEFAULT_ADMIN_EMAIL,
          password: DEFAULT_ADMIN_PASSWORD,
          name: DEFAULT_ADMIN_NAME,
        },
        headers: mockHeaders,
      });

      if (signUpResult?.user) {
        // Set role to admin
        await db
          .update(users)
          .set({ role: "admin" })
          .where(eq(users.id, signUpResult.user.id));

        console.log("Admin user created successfully");
        printCredentials();
        return signUpResult.user;
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // User might already exist
      if (
        errorMessage.includes("already exists") ||
        errorMessage.includes("duplicate")
      ) {
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

          console.log("Updated existing user to admin role");
          printCredentials();
          return existing[0];
        }
      }
      throw error;
    }

    throw new Error("Failed to create admin user");
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Error ensuring admin user:", errorMessage);
    throw error;
  }
}

function printCredentials() {
  console.log("\n" + "=".repeat(50));
  console.log("ADMIN CREDENTIALS");
  console.log("=".repeat(50));
  console.log(`Email: ${DEFAULT_ADMIN_EMAIL}`);
  console.log(`Password: ${DEFAULT_ADMIN_PASSWORD}`);
  console.log("=".repeat(50) + "\n");
}

async function initSystemConfig() {
  try {
    console.log("Initializing system configuration...");

    // Worker parallelism
    const parallelismKey = "worker_parallelism";
    const existingParallelism = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, parallelismKey))
      .limit(1);

    if (existingParallelism.length === 0) {
      await db.insert(systemConfig).values({
        key: parallelismKey,
        value: { parallelism: DEFAULT_SYSTEM_CONFIG.worker_parallelism },
      });
      console.log(`  Set worker_parallelism = ${DEFAULT_SYSTEM_CONFIG.worker_parallelism}`);
    } else {
      console.log(`  worker_parallelism already configured`);
    }

    // Dry run mode
    const dryRunKey = "dry_run_mode";
    const existingDryRun = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.key, dryRunKey))
      .limit(1);

    if (existingDryRun.length === 0) {
      await db.insert(systemConfig).values({
        key: dryRunKey,
        value: { enabled: DEFAULT_SYSTEM_CONFIG.dry_run_mode },
      });
      console.log(`  Set dry_run_mode = ${DEFAULT_SYSTEM_CONFIG.dry_run_mode}`);
    } else {
      console.log(`  dry_run_mode already configured`);
    }

    console.log("System configuration initialized");
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Error initializing system config:", errorMessage);
    throw error;
  }
}

async function initSeerrSettings() {
  try {
    console.log("Initializing Seerr settings...");

    const existing = await db.select().from(seerrSettings).limit(1);

    if (existing.length === 0) {
      await db.insert(seerrSettings).values({
        apiUrl: null,
        apiKey: null,
        seerrType: "overseerr",
        connectionStatus: "disconnected",
      });
      console.log("  Created default Seerr settings (not configured)");
    } else {
      console.log("  Seerr settings already exist");
    }

    console.log("Seerr settings initialized");
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Error initializing Seerr settings:", errorMessage);
    throw error;
  }
}

async function initCacheSettings() {
  try {
    console.log("Initializing cache settings...");

    const existing = await db.select().from(cacheSettings).limit(1);

    if (existing.length === 0) {
      await db.insert(cacheSettings).values({
        enabled: false,
        redisUrl: null,
        ttlSeconds: 3600,
      });
      console.log("  Created default cache settings (Redis disabled)");
    } else {
      console.log("  Cache settings already exist");
    }

    console.log("Cache settings initialized");
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Error initializing cache settings:", errorMessage);
    throw error;
  }
}

async function listUsers() {
  try {
    const allUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users);

    console.log("\n" + "=".repeat(70));
    console.log("USERS");
    console.log("=".repeat(70));

    if (allUsers.length === 0) {
      console.log("No users found.");
    } else {
      console.log(`${allUsers.length} user(s) found:\n`);
      allUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name} (${user.email})`);
        console.log(`   Role: ${user.role}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Created: ${user.createdAt}`);
        console.log("");
      });
    }

    console.log("=".repeat(70) + "\n");

    return allUsers;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Error listing users:", errorMessage);
    throw error;
  }
}

async function addUser(
  email: string,
  name: string,
  password: string,
  role: "user" | "admin" = "user"
) {
  try {
    // Check if user already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      console.error(`User with email ${email} already exists`);
      return null;
    }

    // Create user using better-auth
    const mockHeaders = new Headers();
    mockHeaders.set("host", "localhost:3000");

    const signUpResult = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
      headers: mockHeaders,
    });

    if (signUpResult?.user) {
      // Set role
      await db
        .update(users)
        .set({ role })
        .where(eq(users.id, signUpResult.user.id));

      console.log(`User created successfully: ${name} (${email})`);
      console.log(`   Role: ${role}`);
      return signUpResult.user;
    }

    throw new Error("Failed to create user");
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`Error adding user: ${errorMessage}`);
    throw error;
  }
}

async function deleteUser(emailOrId: string) {
  try {
    // Try to find by email first
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, emailOrId))
      .limit(1);

    // If not found by email, try by ID
    if (user.length === 0) {
      user = await db
        .select()
        .from(users)
        .where(eq(users.id, emailOrId))
        .limit(1);
    }

    if (user.length === 0) {
      console.error(`User not found: ${emailOrId}`);
      return false;
    }

    // Prevent deleting the default admin
    if (user[0].email === DEFAULT_ADMIN_EMAIL) {
      console.error(`Cannot delete the default admin user`);
      return false;
    }

    await db.delete(users).where(eq(users.id, user[0].id));
    console.log(`User deleted: ${user[0].name} (${user[0].email})`);
    return true;
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`Error deleting user: ${errorMessage}`);
    throw error;
  }
}

async function showConfig() {
  try {
    const config = await db.select().from(systemConfig);

    console.log("\n" + "=".repeat(70));
    console.log("SYSTEM CONFIGURATION");
    console.log("=".repeat(70));

    if (config.length === 0) {
      console.log("No configuration found. Run 'bun run db:seed init' first.");
    } else {
      config.forEach((item) => {
        console.log(`${item.key}: ${JSON.stringify(item.value)}`);
      });
    }

    console.log("=".repeat(70) + "\n");
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error("Error showing config:", errorMessage);
    throw error;
  }
}

// Main CLI handler
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case "init":
        console.log("\nInitializing Namerr database...\n");
        await ensureAdminUser();
        await initSystemConfig();
        await initSeerrSettings();
        await initCacheSettings();
        console.log("\nDatabase initialization complete!\n");
        break;

      case "admin":
      case "ensure-admin":
        await ensureAdminUser();
        break;

      case "list":
        await listUsers();
        break;

      case "add":
        if (args.length < 3) {
          console.error(
            "Usage: bun run db:seed add <email> <name> <password> [role]"
          );
          console.error(
            "Example: bun run db:seed add user@example.com 'John Doe' password123 admin"
          );
          process.exit(1);
        }
        const [email, name, password, role] = args;
        await addUser(
          email,
          name,
          password,
          (role as "user" | "admin") || "user"
        );
        break;

      case "delete":
      case "remove":
        if (args.length < 1) {
          console.error("Usage: bun run db:seed delete <email|id>");
          console.error("Example: bun run db:seed delete user@example.com");
          process.exit(1);
        }
        await deleteUser(args[0]);
        break;

      case "config":
        await showConfig();
        break;

      case undefined:
        // Default: run init
        console.log("\nInitializing Namerr database...\n");
        await ensureAdminUser();
        await initSystemConfig();
        await initSeerrSettings();
        await initCacheSettings();
        console.log("\nDatabase initialization complete!\n");
        break;

      case "help":
      case "--help":
      case "-h":
        console.log("Namerr Database Seeding Script");
        console.log("\nUsage: bun run db:seed [command] [args]");
        console.log("\nCommands:");
        console.log(
          "  (no command)          - Initialize database with defaults (same as init)"
        );
        console.log(
          "  init                  - Initialize database with defaults"
        );
        console.log("  admin, ensure-admin   - Ensure default admin user exists");
        console.log("  list                  - List all users");
        console.log(
          "  add <email> <name> <password> [role]  - Add a new user"
        );
        console.log("  delete <email|id>     - Delete a user");
        console.log("  config                - Show system configuration");
        console.log("\nExamples:");
        console.log("  bun run db:seed");
        console.log("  bun run db:seed init");
        console.log("  bun run db:seed admin");
        console.log("  bun run db:seed list");
        console.log(
          "  bun run db:seed add user@example.com 'John Doe' password123"
        );
        console.log("  bun run db:seed delete user@example.com");
        console.log("  bun run db:seed config");
        process.exit(0);

      default:
        console.error(`Unknown command: ${command}`);
        console.log("Run 'bun run db:seed help' for usage information");
        process.exit(1);
    }
  } catch (error) {
    process.exit(1);
  } finally {
    await closeDb();
  }
}

main();
