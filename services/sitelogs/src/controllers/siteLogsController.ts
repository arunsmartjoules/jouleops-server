/**
 * Site Logs Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import siteLogsRepository from "../repositories/siteLogsRepository.ts";
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

  // Log the activity
  logActivity({
    user_id: (req as any).user?.user_id,
    action: "CREATE_LOG",
    module: "SITE_LOG",
    description: `Created site log ${result.id} of type ${result.log_name}`,
    metadata: { logId: result.id, logName: result.log_name, siteCode: result.site_code },
  });

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
    startDate,
    remarks,
    filters,
  } = req.query;

  if (!siteCode) {
    return sendError(res, "Site Code is required");
  }

  let remarksFilter = remarks as string | undefined;
  if (filters) {
    try {
      const parsedFilters = JSON.parse(filters as string);
      const remarkRule = parsedFilters.find((f: any) => f.fieldId === "remarks");
      if (remarkRule) {
        remarksFilter = remarkRule.value;
      }
    } catch (e) {
      console.error("[SITE_LOGS_CONTROLLER] Error parsing filters:", e);
    }
  }

  const result = await siteLogsRepository.getLogsBySite(siteCode, {
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    log_name: (log_name as string) || (type as string) || undefined,
    search: search as string | undefined,
    site_code: site_code as string | undefined,
    log_id: log_id as string | undefined,
    status: status as string | undefined,
    task_line_id: task_line_id as string | undefined,
    date_from: (date_from as string) || (startDate as string) || undefined,
    date_to: (date_to as string) || undefined,
    remarks: remarksFilter,
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

  // Log the activity
  logActivity({
    user_id: (req as any).user?.user_id,
    action: "UPDATE_LOG",
    module: "SITE_LOG",
    description: `Updated site log ${id} of type ${result.log_name}`,
    metadata: { logId: id, logName: result.log_name, siteCode: result.site_code },
  });

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

export default { create, getBySite, getAll, update, remove, bulkRemove };
