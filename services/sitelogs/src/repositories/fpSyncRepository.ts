/**
 * Persists Fieldproxy sync outcomes onto the originating row
 * (site_logs or chiller_readings) so the admin app can display real
 * sync state instead of just "API succeeded".
 */

import { query } from "@jouleops/shared";

export type FpTable = "site_logs" | "chiller_readings";
export type FpSyncStatus =
  | "pending"
  | "synced"
  | "verified"
  | "skipped"
  | "failed";
export type FpSyncAction = "created" | "updated" | "skipped" | null;

interface RecordOptions {
  status: FpSyncStatus;
  action?: FpSyncAction;
  error?: string | null;
  // Whether to set fp_synced_at to NOW(). Only true for terminal states.
  bumpSyncedAt?: boolean;
}

const VALID_TABLES: ReadonlySet<FpTable> = new Set(["site_logs", "chiller_readings"]);

async function record(
  table: FpTable,
  id: string,
  opts: RecordOptions,
): Promise<void> {
  if (!VALID_TABLES.has(table)) {
    throw new Error(`Invalid FP sync table: ${table}`);
  }
  if (!id) return;

  const sets: string[] = ["fp_sync_status = $1"];
  const params: any[] = [opts.status];
  let i = 2;

  if (opts.action !== undefined) {
    sets.push(`fp_sync_action = $${i++}`);
    params.push(opts.action);
  }
  if (opts.error !== undefined) {
    sets.push(`fp_sync_error = $${i++}`);
    params.push(opts.error);
  }
  if (opts.bumpSyncedAt) {
    sets.push(`fp_synced_at = NOW()`);
  }

  params.push(id);

  try {
    await query(
      `UPDATE ${table} SET ${sets.join(", ")} WHERE id = $${i}`,
      params,
    );
  } catch (err: any) {
    // Don't let bookkeeping failures crash the caller — they live in fire-and-forget paths.
    console.error(`[fpSyncRepository] Failed to record ${table}/${id}:`, err?.message || err);
  }
}

export const fpSyncRepository = {
  /** Mark that a sync attempt is in flight. */
  recordPending(table: FpTable, id: string) {
    return record(table, id, { status: "pending", error: null });
  },

  /** FP create/update returned successfully. Verification still pending. */
  recordSynced(table: FpTable, id: string, action: FpSyncAction) {
    return record(table, id, {
      status: "synced",
      action,
      error: null,
      bumpSyncedAt: true,
    });
  },

  /** FP returned skipped (no fields to update — common for unchanged rows). */
  recordSkipped(table: FpTable, id: string, reason?: string) {
    return record(table, id, {
      status: "skipped",
      action: "skipped",
      error: reason ?? null,
      bumpSyncedAt: true,
    });
  },

  /**
   * Verification GET found the FP row exists. This is the strongest signal —
   * it means the data actually landed in Fieldproxy, not just that the write
   * API returned 2xx.
   */
  recordVerified(table: FpTable, id: string) {
    return record(table, id, {
      status: "verified",
      error: null,
      bumpSyncedAt: true,
    });
  },

  /** Sync threw, or verification GET could not locate the FP row. */
  recordFailed(table: FpTable, id: string, error: string) {
    return record(table, id, {
      status: "failed",
      error: error.slice(0, 500),
      bumpSyncedAt: true,
    });
  },
};

export default fpSyncRepository;
