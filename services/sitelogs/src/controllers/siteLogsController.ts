/**
 * Site Logs Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import siteLogsRepository from "../repositories/siteLogsRepository.ts";
import { updateSiteLogInFieldproxy } from "../services/fieldproxyService.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  asyncHandler,
  logActivity,
} from "@jouleops/shared";

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await siteLogsRepository.createLog(req.body);

  logActivity({
    user_id: (req as any).user?.user_id,
    action: "CREATE_LOG",
    module: "SITE_LOG",
    description: `Created site log ${result.id} of type ${result.log_name}`,
    metadata: { logId: result.id, logName: result.log_name, siteCode: result.site_code },
  });

  // Sync to Fieldproxy — fire and forget (records already exist there, just update)
  if (result.log_id) {
    updateSiteLogInFieldproxy({
      log_id: result.log_id,
      log_name: result.log_name,
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
        logActivity({
          user_id: (req as any).user?.user_id,
          action: "SYNC_TO_FIELDPROXY",
          module: "SITE_LOG",
          description: `Synced site log ${result.id} (log_id: ${result.log_id}) to Fieldproxy`,
          metadata: { logId: result.id, log_id: result.log_id, fieldproxy: fp },
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("[FIELDPROXY] site log sync failed:", err);
        logActivity({
          user_id: (req as any).user?.user_id,
          action: "SYNC_TO_FIELDPROXY_FAILED",
          module: "SITE_LOG",
          description: `Failed to sync site log ${result.id} to Fieldproxy`,
          metadata: { logId: result.id, error: err.message },
        }).catch(() => {});
      });
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
    status,
    task_line_id,
    date_from,
    date_to,
    site_codes,
    startDate,
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
    date_from: (date_from as string) || (startDate as string) || undefined,
    date_to: (date_to as string) || undefined,
    remarks: remarksFilter,
    site_codes: site_codes ? (site_codes as string).split(",") : undefined,
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
    user_id: (req as any).user?.user_id,
    action: "UPDATE_LOG",
    module: "SITE_LOG",
    description: `Updated site log ${id} of type ${result.log_name}`,
    metadata: { logId: id, logName: result.log_name, siteCode: result.site_code },
  });

  // Sync to Fieldproxy — fire and forget
  if (result.log_id) {
    updateSiteLogInFieldproxy({
      log_id: result.log_id,
      log_name: result.log_name,
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
        logActivity({
          user_id: (req as any).user?.user_id,
          action: "SYNC_TO_FIELDPROXY",
          module: "SITE_LOG",
          description: `Synced updated site log ${id} (log_id: ${result.log_id}) to Fieldproxy`,
          metadata: { logId: id, log_id: result.log_id, fieldproxy: fp },
        }).catch(() => {});
      })
      .catch((err) => {
        console.error("[FIELDPROXY] site log update sync failed:", err);
        logActivity({
          user_id: (req as any).user?.user_id,
          action: "SYNC_TO_FIELDPROXY_FAILED",
          module: "SITE_LOG",
          description: `Failed to sync updated site log ${id} to Fieldproxy`,
          metadata: { logId: id, error: err.message },
        }).catch(() => {});
      });
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

export default { create, getBySite, getAll, update, remove, bulkRemove, bulkUpsert };
