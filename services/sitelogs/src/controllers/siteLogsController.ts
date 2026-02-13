/**
 * Site Logs Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import siteLogsRepository from "../repositories/siteLogsRepository";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  asyncHandler,
} from "@smartops/shared";

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await siteLogsRepository.createLog(req.body);
  return sendCreated(res, result);
});

export const getBySite = asyncHandler(async (req: Request, res: Response) => {
  const { siteId } = req.params;
  const { page, limit, type } = req.query;

  if (!siteId) {
    return sendError(res, "Site ID is required");
  }

  const result = await siteLogsRepository.getLogsBySite(siteId, {
    page: parseInt(page as string) || 1,
    limit: parseInt(limit as string) || 20,
    log_name: type as string | undefined,
  });
  return sendSuccess(res, result.data, { pagination: result.pagination });
});

export const getAll = asyncHandler(
  async (req: Request, res: Response, next) => {
    req.params.siteId = "all";
    return getBySite(req, res, next);
  },
);

export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, "Log ID is required");
  }
  const result = await siteLogsRepository.updateLog(parseInt(id), req.body);
  return sendSuccess(res, result);
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return sendError(res, "Log ID is required");
  }
  await siteLogsRepository.deleteLog(parseInt(id));
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
