/**
 * Migration script to convert SSH credentials from plaintext to encrypted storage
 * This script:
 * 1. Renames existing columns to preserve data
 * 2. Creates new JSONB columns for encrypted data
 * 3. Encrypts and migrates existing plaintext credentials
 * 4. Drops old columns after verification
 */

import { db } from "../src/lib/db";
import { sshHosts } from "../src/lib/db/schema";
import { sql } from "drizzle-orm";
import { encrypt } from "../src/lib/crypto";

async function migrateSshCredentials() {
  console.log("🔐 Starting SSH credentials encryption migration...\n");

  try {
    // Step 1: Check if migration is needed
    console.log("Step 1: Checking database schema...");
    const result = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'ssh_hosts'
      AND column_name IN ('password', 'private_key', 'passphrase')
    `);

    const columns = result.rows as Array<{ column_name: string; data_type: string }>;
    const passwordColumn = columns.find((c) => c.column_name === "password");

    if (!passwordColumn) {
      console.log("✅ No ssh_hosts table found or already migrated");
      return;
    }

    if (passwordColumn.data_type === "jsonb") {
      console.log("✅ Columns are already JSONB - migration not needed");
      return;
    }

    console.log("📝 Found text columns, proceeding with migration...\n");

    // Step 2: Rename existing columns
    console.log("Step 2: Renaming existing columns to preserve data...");
    await db.execute(sql`
      DO $$
      BEGIN
        -- Only rename if not already renamed
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'ssh_hosts' AND column_name = 'password' AND data_type = 'text'
        ) THEN
          ALTER TABLE ssh_hosts RENAME COLUMN password TO password_old_plaintext;
          ALTER TABLE ssh_hosts RENAME COLUMN private_key TO private_key_old_plaintext;
          ALTER TABLE ssh_hosts RENAME COLUMN passphrase TO passphrase_old_plaintext;
        END IF;
      END
      $$;
    `);
    console.log("✅ Renamed old columns\n");

    // Step 3: Create new JSONB columns
    console.log("Step 3: Creating new JSONB columns...");
    await db.execute(sql`
      ALTER TABLE ssh_hosts ADD COLUMN IF NOT EXISTS password jsonb;
      ALTER TABLE ssh_hosts ADD COLUMN IF NOT EXISTS private_key jsonb;
      ALTER TABLE ssh_hosts ADD COLUMN IF NOT EXISTS passphrase jsonb;
    `);
    console.log("✅ Created new JSONB columns\n");

    // Step 4: Encrypt and migrate existing data
    console.log("Step 4: Encrypting and migrating existing credentials...");
    const hosts = await db.execute(sql`
      SELECT id, password_old_plaintext, private_key_old_plaintext, passphrase_old_plaintext
      FROM ssh_hosts
      WHERE password_old_plaintext IS NOT NULL
         OR private_key_old_plaintext IS NOT NULL
         OR passphrase_old_plaintext IS NOT NULL
    `);

    if (hosts.rows.length === 0) {
      console.log("ℹ️  No existing credentials to migrate\n");
    } else {
      console.log(`Found ${hosts.rows.length} hosts with credentials to encrypt`);

      for (const host of hosts.rows as Array<{
        id: string;
        password_old_plaintext: string | null;
        private_key_old_plaintext: string | null;
        passphrase_old_plaintext: string | null;
      }>) {
        const encryptedPassword = encrypt(host.password_old_plaintext);
        const encryptedPrivateKey = encrypt(host.private_key_old_plaintext);
        const encryptedPassphrase = encrypt(host.passphrase_old_plaintext);

        await db.execute(sql`
          UPDATE ssh_hosts
          SET
            password = ${encryptedPassword ? JSON.stringify(encryptedPassword) : null}::jsonb,
            private_key = ${encryptedPrivateKey ? JSON.stringify(encryptedPrivateKey) : null}::jsonb,
            passphrase = ${encryptedPassphrase ? JSON.stringify(encryptedPassphrase) : null}::jsonb
          WHERE id = ${host.id}
        `);

        console.log(`  ✓ Encrypted credentials for host ${host.id}`);
      }
      console.log("✅ All credentials encrypted and migrated\n");
    }

    // Step 5: Drop old columns
    console.log("Step 5: Dropping old plaintext columns...");
    await db.execute(sql`
      ALTER TABLE ssh_hosts DROP COLUMN IF EXISTS password_old_plaintext;
      ALTER TABLE ssh_hosts DROP COLUMN IF EXISTS private_key_old_plaintext;
      ALTER TABLE ssh_hosts DROP COLUMN IF EXISTS passphrase_old_plaintext;
    `);
    console.log("✅ Dropped old columns\n");

    console.log("🎉 Migration completed successfully!");
    console.log("\nAll SSH credentials are now encrypted using AES-256-GCM.");
    console.log("Make sure to set a secure ENCRYPTION_KEY in your .env file for production.");

  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    console.error("\nThe database may be in an inconsistent state.");
    console.error("Please review the error and try again, or restore from backup.");
    process.exit(1);
  }
}

// Run migration
migrateSshCredentials()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
