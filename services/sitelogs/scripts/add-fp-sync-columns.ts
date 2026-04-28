import { query } from "@jouleops/shared";

/**
 * Adds Fieldproxy sync tracking columns to site_logs and chiller_readings.
 * Idempotent — safe to re-run.
 *
 * Status values:
 *   pending   — sync attempt started
 *   synced    — FP API returned success (created or updated)
 *   verified  — FP row was re-fetched and confirmed to exist
 *   skipped   — FP returned skipped (no fields to update)
 *   failed    — sync threw or verify could not find the row
 *   NULL      — never attempted
 *
 * Action values: created | updated | skipped | NULL
 */
async function addFpSyncColumns() {
  const tables = ["site_logs", "chiller_readings"] as const;

  for (const table of tables) {
    console.log(`Adding FP sync columns to ${table}...`);
    await query(`
      ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS fp_sync_status TEXT,
        ADD COLUMN IF NOT EXISTS fp_sync_action TEXT,
        ADD COLUMN IF NOT EXISTS fp_synced_at   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS fp_sync_error  TEXT;
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_${table}_fp_sync_status
        ON ${table} (fp_sync_status);
    `);
    console.log(`  ✓ ${table} updated`);
  }

  console.log("Done.");
}

addFpSyncColumns()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
