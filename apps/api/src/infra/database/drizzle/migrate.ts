import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

/**
 * Applies pending migrations in production.
 *
 * WHY NOT `drizzle-kit migrate`: drizzle-kit is a devDependency and the runtime
 * image installs with `--omit=dev`, so the CLI simply is not there. This reads
 * the exact same `apps/api/drizzle/*.sql` files and the same
 * `drizzle/meta/_journal.json` ledger that drizzle-kit writes, and records
 * applied migrations in the same `__drizzle_migrations` table — identical
 * semantics, no devDependencies shipped to the server. drizzle-kit remains the
 * tool for *generating* migrations during development.
 *
 * Run by `scripts/deploy.sh` BEFORE the containers are restarted, so the new
 * code never meets an old schema.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

// dist/infra/database/drizzle -> apps/api (and src/... resolves the same way,
// so `tsx src/infra/database/drizzle/migrate.ts` works too).
const migrationsFolder = path.resolve(here, "../../../../drizzle");

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // A single connection, and `max: 1` specifically: migrations must run
  // serially, and a pool would let two of them race if the script were ever
  // invoked twice concurrently during a deploy.
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });

  try {
    console.log(`Applying migrations from ${migrationsFolder}`);
    await migrate(drizzle(client), { migrationsFolder });
    console.log("Migrations applied successfully");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  // Non-zero exit is what makes deploy.sh abort before restarting anything.
  process.exit(1);
});
