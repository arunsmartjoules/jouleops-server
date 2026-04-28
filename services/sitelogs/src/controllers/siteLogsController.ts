/**
 * Site Logs Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import siteLogsRepository from "../repositories/siteLogsRepository.ts";
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
      .then((fp) => {
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

        // Post-sync verification snapshot for history-edit/update visibility.
        if (syncStatus.action !== "SYNC_TO_FIELDPROXY_FAILED") {
          verifySiteLogInFieldproxy({
            log_id: result.log_id,
            log_name: result.log_name,
            task_name: result.task_name,
            scheduled_date: result.scheduled_date,
          })
            .then((verify) => {
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
            })
            .catch((verifyErr) => {
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
            });
        }
      })
      .catch((err) => {
        console.error("[FIELDPROXY] site log sync failed:", err);
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: "SYNC_TO_FIELDPROXY_FAILED",
          module: "SITE_LOG",
          description: `Failed to sync site log ${result.id} to Fieldproxy`,
          metadata: { logId: result.id, error: err.message },
        }).catch(() => {});
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
      .then((fp) => {
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

        // Post-sync verification snapshot for history-edit/update visibility.
        if (syncStatus.action !== "SYNC_TO_FIELDPROXY_FAILED") {
          verifySiteLogInFieldproxy({
            log_id: result.log_id,
            log_name: result.log_name,
            task_name: result.task_name,
            scheduled_date: result.scheduled_date,
          })
            .then((verify) => {
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
            })
            .catch((verifyErr) => {
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
            });
        }
      })
      .catch((err) => {
        console.error("[FIELDPROXY] site log update sync failed:", err);
        logActivity({
          user_id: (req as any).user?.user_id || (req as any).user?.id,
          action: "SYNC_TO_FIELDPROXY_FAILED",
          module: "SITE_LOG",
          description: `Failed to sync updated site log ${id} to Fieldproxy`,
          metadata: { logId: id, error: err.message },
        }).catch(() => {});
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
    return {
      id: log.id,
      log_id: log.log_id,
      action: "failed",
      error: "Missing log_name — cannot sync to Fieldproxy",
    };
  }

  try {
    const fp = await updateSiteLogInFieldproxy(buildSiteLogSyncPayload(log));

    if (fp.error) {
      return {
        id: log.id,
        log_id: log.log_id,
        action: "failed",
        error: fp.error,
      };
    }

    const action = fp.action ?? "updated";
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
    return {
      id: log.id,
      log_id: log.log_id,
      action: "failed",
      error: error?.message || "Failed to sync site log to Fieldproxy",
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
};
