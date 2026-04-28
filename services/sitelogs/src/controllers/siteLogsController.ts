/**
 * Site Logs Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import siteLogsRepository from "../repositories/siteLogsRepository.ts";
import fpSyncRepository from "../repositories/fpSyncRepository.ts";
import {
  updateSiteLogInFieldproxy,
  verifySiteLogInFieldproxy,
} from "../services/fieldproxyService.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  asyncHandler,
  logActivity,
} from "@jouleops/shared";

function getSyncStatus(fp: any): {
  action: "SYNC_TO_FIELDPROXY" | "SYNC_TO_FIELDPROXY_FAILED" | "SYNC_TO_FIELDPROXY_SKIPPED";
  description: string;
} {
  const logTaskError = fp?.logTaskLine?.error;
  const taskMgmtError = fp?.taskManagement?.error;
  const logTaskSkipped = fp?.logTaskLine?.skipped;
  const taskMgmtSkipped = fp?.taskManagement?.skipped;

  if (logTaskError || taskMgmtError) {
    return {
      action: "SYNC_TO_FIELDPROXY_FAILED",
      description: "Fieldproxy sync completed with errors",
    };
  }

  if (logTaskSkipped || taskMgmtSkipped) {
    return {
      action: "SYNC_TO_FIELDPROXY_SKIPPED",
      description: "Fieldproxy sync skipped (no fields / partial prerequisites)",
    };
  }

  return {
    action: "SYNC_TO_FIELDPROXY",
    description: "Fieldproxy sync successful",
  };
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await siteLogsRepository.createLog(req.body);

  logActivity({
    user_id: (req as any).user?.user_id || (req as any).user?.id,
    action: "CREATE_LOG",
    module: "SITE_LOG",
    description: `Created site log ${result.id} of type ${result.log_name}`,
    metadata: { logId: result.id, logName: result.log_name, siteCode: result.site_code },
  });

  // Sync to Fieldproxy — fire and forget.
  // Service handles lookup fallback:
  // 1) scheduled_date + task_name + log_name
  // 2) log_id
  if (result.log_name) {
    fpSyncRepository.recordPending("site_logs", result.id);
    updateSiteLogInFieldproxy({
      log_id: result.log_id,
      log_name: result.log_name,
      task_name: result.task_name,
      scheduled_date: result.scheduled_date,
      site_id: result.site_code,
      temperature: result.temperature,
      rh: result.rh,
      tds: result.tds,
      ph: result.ph,
      hardness: result.hardness,
      chemical_dosing: result.chemical_dosing,
      main_remarks: result.main_remarks,
      remarks: result.remarks,
      signature: result.signature,
      attachment: result.attachment,
      entry_time: result.entry_time,
      end_time: result.end_time,
      executor_id: result.executor_id,
      status: result.status,
    })
      .then(async (fp) => {
        const syncStatus = getSyncStatus(fp);
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: syncStatus.action,
          module: "SITE_LOG",
          description: `${syncStatus.description} for site log ${result.id}`,
          metadata: {
            logId: result.id,
            log_id: result.log_id,
            scheduled_date: result.scheduled_date,
            task_name: result.task_name,
            log_name: result.log_name,
            fieldproxy: fp,
          },
        }).catch(() => {});

        if (syncStatus.action === "SYNC_TO_FIELDPROXY_FAILED") {
          const errMsg =
            fp?.logTaskLine?.error ||
            fp?.taskManagement?.error ||
            "Fieldproxy returned errors";
          await fpSyncRepository.recordFailed("site_logs", result.id, errMsg);
          return;
        }
        if (syncStatus.action === "SYNC_TO_FIELDPROXY_SKIPPED") {
          await fpSyncRepository.recordSkipped("site_logs", result.id);
          return;
        }
        await fpSyncRepository.recordSynced(
          "site_logs",
          result.id,
          fp?.action ?? null,
        );

        // Verification: re-fetch the FP row to confirm it actually exists.
        try {
          const verify = await verifySiteLogInFieldproxy({
            log_id: result.log_id,
            log_name: result.log_name,
            task_name: result.task_name,
            scheduled_date: result.scheduled_date,
          });
          logActivity({
            user_id: (req as any).user?.user_id || (req as any).user?.id,
            action: "VERIFY_FIELDPROXY_SYNC",
            module: "SITE_LOG",
            description: `Verified Fieldproxy row after syncing site log ${result.id}`,
            metadata: {
              logId: result.id,
              log_id: result.log_id,
              scheduled_date: result.scheduled_date,
              task_name: result.task_name,
              log_name: result.log_name,
              verify,
            },
          }).catch(() => {});
          if (verify.row) {
            await fpSyncRepository.recordVerified("site_logs", result.id);
          } else {
            await fpSyncRepository.recordFailed(
              "site_logs",
              result.id,
              verify.error || "Fieldproxy row not found after sync",
            );
          }
        } catch (verifyErr: any) {
          logActivity({
            user_id: (req as any).user?.user_id || (req as any).user?.id,
            action: "VERIFY_FIELDPROXY_SYNC_FAILED",
            module: "SITE_LOG",
            description: `Failed to verify Fieldproxy row after syncing site log ${result.id}`,
            metadata: {
              logId: result.id,
              error: verifyErr?.message || String(verifyErr),
            },
          }).catch(() => {});
          await fpSyncRepository.recordFailed(
            "site_logs",
            result.id,
            `Verification failed: ${verifyErr?.message || String(verifyErr)}`,
          );
        }
      })
      .catch(async (err) => {
        console.error("[FIELDPROXY] site log sync failed:", err);
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: "SYNC_TO_FIELDPROXY_FAILED",
          module: "SITE_LOG",
          description: `Failed to sync site log ${result.id} to Fieldproxy`,
          metadata: { logId: result.id, error: err.message },
        }).catch(() => {});
        await fpSyncRepository.recordFailed(
          "site_logs",
          result.id,
          err?.message || String(err),
        );
      });
  } else {
    logActivity({
      user_id: (req as any).user?.user_id || (req as any).user?.id,
      action: "SYNC_TO_FIELDPROXY_SKIPPED",
      module: "SITE_LOG",
      description: `Skipped Fieldproxy sync for site log ${result.id} due to missing lookup fields`,
      metadata: {
        logId: result.id,
        log_id: result.log_id,
        scheduled_date: result.scheduled_date,
        task_name: result.task_name,
        log_name: result.log_name,
      },
    }).catch(() => {});
    await fpSyncRepository.recordSkipped(
      "site_logs",
      result.id,
      "Missing log_name",
    );
  }

  return sendCreated(res, result);
});

export const getBySite = asyncHandler(async (req: Request, res: Response) => {
  const { siteCode } = req.params;
  const {
    page,
    limit,
    type,
    search,
    log_id,
    log_name,
    site_code,
    task_name,
    status,
    task_line_id,
    date_from,
    date_to,
    site_codes,
    startDate,
    fromDate,
    toDate,
    scheduled_date,
    scheduled_date_from,
    scheduled_date_to,
    remarks,
    filters,
  } = req.query;

  if (!siteCode) {
    return sendError(res, "Site Code is required");
  }

  let remarksFilter = remarks as string | undefined;
  let statusFilter = status as string | undefined;
  let siteCodeFilter = site_code as string | undefined;
  let logIdFilter = log_id as string | undefined;
  let taskNameFilter = task_name as string | undefined;

  if (filters) {
    try {
      const parsedFilters = JSON.parse(filters as string);

      const remarkRule = parsedFilters.find((f: any) => f.fieldId === "remarks");
      if (remarkRule) remarksFilter = remarkRule.value;

      const statusRule = parsedFilters.find((f: any) => f.fieldId === "status");
      if (statusRule) statusFilter = statusRule.value;

      const siteCodeRule = parsedFilters.find(
        (f: any) => f.fieldId === "site_code",
      );
      if (siteCodeRule) siteCodeFilter = siteCodeRule.value;

      const logIdRule = parsedFilters.find((f: any) => f.fieldId === "log_id");
      if (logIdRule) logIdFilter = logIdRule.value;
    } catch (e) {
      console.error("[SITE_LOGS_CONTROLLER] Error parsing filters:", e);
    }
  }

  const result = await siteLogsRepository.getLogsBySite(siteCode, {
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    log_name: (log_name as string) || (type as string) || undefined,
    search: search as string | undefined,
    site_code: siteCodeFilter,
    log_id: logIdFilter,
    status: statusFilter,
    task_line_id: task_line_id as string | undefined,
    task_name: taskNameFilter,
    date_from: (date_from as string) || (startDate as string) || undefined,
    date_to: (date_to as string) || undefined,
    remarks: remarksFilter,
    site_codes: site_codes ? (site_codes as string).split(",") : undefined,
    // Mobile client passes fromDate/toDate for scheduled_date filtering.
    scheduled_date: scheduled_date as string | undefined,
    scheduled_date_from:
      (scheduled_date_from as string) ||
      (fromDate as string) ||
      undefined,
    scheduled_date_to:
      (scheduled_date_to as string) || (toDate as string) || undefined,
  });
  return sendSuccess(res, result.data, { pagination: result.pagination });
});

export const getAll = asyncHandler(
  async (req: Request, res: Response, next) => {
    req.params.siteCode = "all";
    return getBySite(req, res, next);
  },
);

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, "Log ID is required");
  }
  const result = await siteLogsRepository.updateLog(id, req.body);

  logActivity({
    user_id: (req as any).user?.user_id || (req as any).user?.id,
    action: "UPDATE_LOG",
    module: "SITE_LOG",
    description: `Updated site log ${id} of type ${result.log_name}`,
    metadata: { logId: id, logName: result.log_name, siteCode: result.site_code },
  });

  // Sync to Fieldproxy — fire and forget.
  // Service handles lookup fallback:
  // 1) scheduled_date + task_name + log_name
  // 2) log_id
  if (result.log_name) {
    fpSyncRepository.recordPending("site_logs", id);
    updateSiteLogInFieldproxy({
      log_id: result.log_id,
      log_name: result.log_name,
      task_name: result.task_name,
      scheduled_date: result.scheduled_date,
      site_id: result.site_code,
      temperature: result.temperature,
      rh: result.rh,
      tds: result.tds,
      ph: result.ph,
      hardness: result.hardness,
      chemical_dosing: result.chemical_dosing,
      main_remarks: result.main_remarks,
      remarks: result.remarks,
      signature: result.signature,
      attachment: result.attachment,
      entry_time: result.entry_time,
      end_time: result.end_time,
      executor_id: result.executor_id,
      status: result.status,
    })
      .then(async (fp) => {
        const syncStatus = getSyncStatus(fp);
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: syncStatus.action,
          module: "SITE_LOG",
          description: `${syncStatus.description} for updated site log ${id}`,
          metadata: {
            logId: id,
            log_id: result.log_id,
            scheduled_date: result.scheduled_date,
            task_name: result.task_name,
            log_name: result.log_name,
            fieldproxy: fp,
          },
        }).catch(() => {});

        if (syncStatus.action === "SYNC_TO_FIELDPROXY_FAILED") {
          const errMsg =
            fp?.logTaskLine?.error ||
            fp?.taskManagement?.error ||
            "Fieldproxy returned errors";
          await fpSyncRepository.recordFailed("site_logs", id, errMsg);
          return;
        }
        if (syncStatus.action === "SYNC_TO_FIELDPROXY_SKIPPED") {
          await fpSyncRepository.recordSkipped("site_logs", id);
          return;
        }
        await fpSyncRepository.recordSynced(
          "site_logs",
          id,
          fp?.action ?? null,
        );

        try {
          const verify = await verifySiteLogInFieldproxy({
            log_id: result.log_id,
            log_name: result.log_name,
            task_name: result.task_name,
            scheduled_date: result.scheduled_date,
          });
          logActivity({
            user_id: (req as any).user?.user_id || (req as any).user?.id,
            action: "VERIFY_FIELDPROXY_SYNC",
            module: "SITE_LOG",
            description: `Verified Fieldproxy row after updating site log ${id}`,
            metadata: {
              logId: id,
              log_id: result.log_id,
              scheduled_date: result.scheduled_date,
              task_name: result.task_name,
              log_name: result.log_name,
              verify,
            },
          }).catch(() => {});
          if (verify.row) {
            await fpSyncRepository.recordVerified("site_logs", id);
          } else {
            await fpSyncRepository.recordFailed(
              "site_logs",
              id,
              verify.error || "Fieldproxy row not found after sync",
            );
          }
        } catch (verifyErr: any) {
          logActivity({
            user_id: (req as any).user?.user_id || (req as any).user?.id,
            action: "VERIFY_FIELDPROXY_SYNC_FAILED",
            module: "SITE_LOG",
            description: `Failed to verify Fieldproxy row after updating site log ${id}`,
            metadata: {
              logId: id,
              error: verifyErr?.message || String(verifyErr),
            },
          }).catch(() => {});
          await fpSyncRepository.recordFailed(
            "site_logs",
            id,
            `Verification failed: ${verifyErr?.message || String(verifyErr)}`,
          );
        }
      })
      .catch(async (err) => {
        console.error("[FIELDPROXY] site log update sync failed:", err);
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: "SYNC_TO_FIELDPROXY_FAILED",
          module: "SITE_LOG",
          description: `Failed to sync updated site log ${id} to Fieldproxy`,
          metadata: { logId: id, error: err.message },
        }).catch(() => {});
        await fpSyncRepository.recordFailed(
          "site_logs",
          id,
          err?.message || String(err),
        );
      });
  } else {
    logActivity({
      user_id: (req as any).user?.user_id || (req as any).user?.id,
      action: "SYNC_TO_FIELDPROXY_SKIPPED",
      module: "SITE_LOG",
      description: `Skipped Fieldproxy sync for updated site log ${id} due to missing lookup fields`,
      metadata: {
        logId: id,
        log_id: result.log_id,
        scheduled_date: result.scheduled_date,
        task_name: result.task_name,
        log_name: result.log_name,
      },
    }).catch(() => {});
    await fpSyncRepository.recordSkipped(
      "site_logs",
      id,
      "Missing log_name",
    );
  }

  return sendSuccess(res, result);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, "Log ID is required");
  }
  await siteLogsRepository.deleteLog(id);
  return sendSuccess(res, null, { message: "Log deleted successfully" });
});

export const bulkRemove = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return sendError(res, "Invalid IDs provided");
  }
  const result = await siteLogsRepository.deleteLogs(ids);
  return sendSuccess(res, result);
});

export const bulkUpsert = asyncHandler(async (req: Request, res: Response) => {
  const { logs } = req.body;
  if (!logs || !Array.isArray(logs)) {
    return sendError(res, "Invalid logs provided");
  }
  const result = await siteLogsRepository.bulkUpsertLogs(logs);
  return sendSuccess(res, result);
});

type ManualSiteLogSyncResult = {
  id: string;
  log_id?: string | null;
  action: "created" | "updated" | "skipped" | "failed";
  message?: string;
  error?: string;
};

const buildSiteLogSyncPayload = (log: any) => ({
  log_id: log.log_id,
  log_name: log.log_name,
  task_name: log.task_name,
  scheduled_date: log.scheduled_date,
  site_id: log.site_code,
  temperature: log.temperature,
  rh: log.rh,
  tds: log.tds,
  ph: log.ph,
  hardness: log.hardness,
  chemical_dosing: log.chemical_dosing,
  main_remarks: log.main_remarks,
  remarks: log.remarks,
  signature: log.signature,
  attachment: log.attachment,
  entry_time: log.entry_time,
  end_time: log.end_time,
  executor_id: log.executor_id,
  status: log.status,
});

const syncSingleSiteLog = async (log: any): Promise<ManualSiteLogSyncResult> => {
  if (!log.log_name) {
    await fpSyncRepository.recordSkipped(
      "site_logs",
      log.id,
      "Missing log_name",
    );
    return {
      id: log.id,
      log_id: log.log_id,
      action: "failed",
      error: "Missing log_name — cannot sync to Fieldproxy",
    };
  }

  fpSyncRepository.recordPending("site_logs", log.id);
  try {
    const fp = await updateSiteLogInFieldproxy(buildSiteLogSyncPayload(log));

    if (fp.error) {
      await fpSyncRepository.recordFailed("site_logs", log.id, fp.error);
      return {
        id: log.id,
        log_id: log.log_id,
        action: "failed",
        error: fp.error,
      };
    }

    const action = fp.action ?? "updated";
    if (action === "skipped") {
      await fpSyncRepository.recordSkipped("site_logs", log.id);
    } else {
      await fpSyncRepository.recordSynced("site_logs", log.id, action);
      // Verify the FP row landed.
      try {
        const verify = await verifySiteLogInFieldproxy({
          log_id: log.log_id,
          log_name: log.log_name,
          task_name: log.task_name,
          scheduled_date: log.scheduled_date,
        });
        if (verify.row) {
          await fpSyncRepository.recordVerified("site_logs", log.id);
        } else {
          await fpSyncRepository.recordFailed(
            "site_logs",
            log.id,
            verify.error || "Fieldproxy row not found after sync",
          );
        }
      } catch (verifyErr: any) {
        await fpSyncRepository.recordFailed(
          "site_logs",
          log.id,
          `Verification failed: ${verifyErr?.message || String(verifyErr)}`,
        );
      }
    }
    return {
      id: log.id,
      log_id: log.log_id,
      action,
      message:
        action === "created"
          ? "Created new Fieldproxy row"
          : action === "skipped"
            ? "No fields to update"
            : "Updated existing Fieldproxy row",
    };
  } catch (error: any) {
    const msg = error?.message || "Failed to sync site log to Fieldproxy";
    await fpSyncRepository.recordFailed("site_logs", log.id, msg);
    return {
      id: log.id,
      log_id: log.log_id,
      action: "failed",
      error: msg,
    };
  }
};

export const syncFieldproxySingle = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Site log ID is required");
    }

    const log = await siteLogsRepository.getLogById(id);
    if (!log) {
      return sendError(res, "Site log not found");
    }

    logActivity({
      user_id: (req as any).user?.user_id || (req as any).user?.id,
      action: "MANUAL_FIELDPROXY_SYNC_START",
      module: "SITE_LOG",
      description: `Manual Fieldproxy sync started for site log ${id}`,
      metadata: { logId: id, log_id: log.log_id, mode: "single" },
    }).catch(() => {});

    const result = await syncSingleSiteLog(log);

    logActivity({
      user_id: (req as any).user?.user_id || (req as any).user?.id,
      action:
        result.action === "failed"
          ? "MANUAL_FIELDPROXY_SYNC_FAILED"
          : "MANUAL_FIELDPROXY_SYNC_SUCCESS",
      module: "SITE_LOG",
      description:
        result.action === "failed"
          ? `Manual Fieldproxy sync failed for site log ${id}`
          : `Manual Fieldproxy sync ${result.action} for site log ${id}`,
      metadata: {
        logId: id,
        log_id: log.log_id,
        mode: "single",
        action: result.action,
        error: result.error,
      },
    }).catch(() => {});

    if (result.action === "failed") {
      return sendError(res, result.error || "Fieldproxy sync failed");
    }

    return sendSuccess(res, result, {
      message: `Fieldproxy sync ${result.action} for site log ${id}`,
    });
  },
);

export const syncFieldproxyBulk = asyncHandler(
  async (req: Request, res: Response) => {
    const { ids } = req.body as { ids?: string[] };

    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "ids array is required");
    }

    const uniqueIds = Array.from(
      new Set(ids.map((i) => String(i).trim()).filter(Boolean)),
    );
    const results: ManualSiteLogSyncResult[] = [];

    for (const id of uniqueIds) {
      const log = await siteLogsRepository.getLogById(id);
      if (!log) {
        results.push({
          id,
          action: "failed",
          error: "Site log not found",
        });
        continue;
      }

      const result = await syncSingleSiteLog(log);
      results.push(result);

      logActivity({
        user_id: (req as any).user?.user_id || (req as any).user?.id,
        action:
          result.action === "failed"
            ? "MANUAL_FIELDPROXY_SYNC_FAILED"
            : "MANUAL_FIELDPROXY_SYNC_SUCCESS",
        module: "SITE_LOG",
        description:
          result.action === "failed"
            ? `Bulk Fieldproxy sync failed for site log ${id}`
            : `Bulk Fieldproxy sync ${result.action} for site log ${id}`,
        metadata: {
          logId: id,
          log_id: log.log_id,
          mode: "bulk",
          action: result.action,
          error: result.error,
        },
      }).catch(() => {});
    }

    const summary = {
      total: results.length,
      updated: results.filter((r) => r.action === "updated").length,
      created: results.filter((r) => r.action === "created").length,
      skipped: results.filter((r) => r.action === "skipped").length,
      failed: results.filter((r) => r.action === "failed").length,
    };

    return sendSuccess(
      res,
      { summary, results },
      {
        message: `Fieldproxy bulk sync completed: updated ${summary.updated}, created ${summary.created}, failed ${summary.failed}`,
      },
    );
  },
);

/**
 * Backfill: re-sync rows whose fp_sync_status is NULL or 'failed'.
 * Bounded by `limit` (default 100, max 500) to keep the request scoped.
 * Optional filters: site_code, log_name, scheduled_date_from/to, only_failed.
 *
 * Use this once after deploying the FP sync columns to populate state for
 * historical rows, or to retry rows that previously failed FP sync.
 */
export const backfillFpSync = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      limit: rawLimit,
      site_code,
      log_name,
      scheduled_date_from,
      scheduled_date_to,
      only_failed,
      dry_run,
    } = (req.body || {}) as {
      limit?: number;
      site_code?: string;
      log_name?: string;
      scheduled_date_from?: string;
      scheduled_date_to?: string;
      only_failed?: boolean;
      dry_run?: boolean;
    };

    const limit = Math.min(Math.max(Number(rawLimit) || 100, 1), 500);
    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;

    if (only_failed) {
      conditions.push(`fp_sync_status = 'failed'`);
    } else {
      conditions.push(`(fp_sync_status IS NULL OR fp_sync_status = 'failed')`);
    }
    if (site_code) {
      conditions.push(`site_code = $${i++}`);
      params.push(site_code);
    }
    if (log_name) {
      conditions.push(`log_name = $${i++}`);
      params.push(log_name);
    }
    if (scheduled_date_from) {
      conditions.push(`scheduled_date >= $${i++}`);
      params.push(scheduled_date_from);
    }
    if (scheduled_date_to) {
      conditions.push(`scheduled_date <= $${i++}`);
      params.push(scheduled_date_to);
    }

    const sql = `
      SELECT * FROM site_logs
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${i}
    `;
    params.push(limit);

    const { query: rawQuery } = await import("@jouleops/shared");
    const rows = await rawQuery<any>(sql, params);

    if (dry_run) {
      return sendSuccess(res, {
        dry_run: true,
        candidates: rows.length,
        sample: rows.slice(0, 5).map((r) => ({
          id: r.id,
          site_code: r.site_code,
          log_name: r.log_name,
          task_name: r.task_name,
          scheduled_date: r.scheduled_date,
          fp_sync_status: r.fp_sync_status,
        })),
      });
    }

    const results: ManualSiteLogSyncResult[] = [];
    for (const row of rows) {
      const r = await syncSingleSiteLog(row);
      results.push(r);
    }

    const summary = {
      total: results.length,
      created: results.filter((r) => r.action === "created").length,
      updated: results.filter((r) => r.action === "updated").length,
      skipped: results.filter((r) => r.action === "skipped").length,
      failed: results.filter((r) => r.action === "failed").length,
    };

    logActivity({
      user_id: (req as any).user?.user_id || (req as any).user?.id,
      action: "BACKFILL_FIELDPROXY_SYNC",
      module: "SITE_LOG",
      description: `FP sync backfill processed ${summary.total} site log rows`,
      metadata: { summary, filters: { site_code, log_name, scheduled_date_from, scheduled_date_to, only_failed, limit } },
    }).catch(() => {});

    return sendSuccess(
      res,
      { summary, results },
      {
        message: `Backfill complete — created ${summary.created}, updated ${summary.updated}, failed ${summary.failed}`,
      },
    );
  },
);

export default {
  create,
  getBySite,
  getAll,
  update,
  remove,
  bulkRemove,
  bulkUpsert,
  syncFieldproxySingle,
  syncFieldproxyBulk,
  backfillFpSync,
};
