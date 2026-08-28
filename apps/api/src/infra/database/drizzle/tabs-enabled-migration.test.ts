/**
 * Guards the ONE thing a regenerated migration silently loses: the backfill.
 *
 * `users.tabs_enabled` became `tabs_enabled_pc` + `tabs_enabled_mobile`. Both
 * new columns default to TRUE, so without an explicit copy every account that
 * had deliberately turned tabs OFF gets them switched back on by the deploy —
 * a data-losing change that no status code and no green endpoint test reveals.
 *
 * Asserted against the migration FILE rather than a live database because the
 * gate runs without docker; the real database was also verified by hand (a
 * pre-existing `tabs_enabled = false` row reads back false on both columns).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const MIGRATION = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../drizzle/0021_gray_ser_duncan.sql",
);

describe("migration 0021 — tabs_enabled split per viewport", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("adds both per-viewport columns, NOT NULL and defaulting to true", () => {
    for (const column of ["tabs_enabled_pc", "tabs_enabled_mobile"]) {
      expect(sql).toContain(
        `ADD COLUMN "${column}" boolean DEFAULT true NOT NULL`,
      );
    }
  });

  it("copies the old value into BOTH new columns", () => {
    expect(sql).toContain('"tabs_enabled_pc" = "tabs_enabled"');
    expect(sql).toContain('"tabs_enabled_mobile" = "tabs_enabled"');
  });

  it("copies before dropping, and after adding — otherwise the copy cannot run", () => {
    const addPc = sql.indexOf('ADD COLUMN "tabs_enabled_pc"');
    const addMobile = sql.indexOf('ADD COLUMN "tabs_enabled_mobile"');
    const copy = sql.indexOf('"tabs_enabled_pc" = "tabs_enabled"');
    const drop = sql.indexOf('DROP COLUMN "tabs_enabled"');

    expect(addPc).toBeGreaterThanOrEqual(0);
    expect(addMobile).toBeGreaterThan(addPc);
    expect(copy).toBeGreaterThan(addMobile);
    expect(drop).toBeGreaterThan(copy);
  });

  it("drops the old single column", () => {
    expect(sql).toContain('DROP COLUMN "tabs_enabled"');
  });
});
