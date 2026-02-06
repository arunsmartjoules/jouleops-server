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
  sendServerError,
} from "@smartops/shared";

export const create = async (req: Request, res: Response) => {
  try {
    const result = await siteLogsRepository.createLog(req.body);
    return sendCreated(res, result);
  } catch (error: any) {
    console.error("Create site log error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
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
  } catch (error: any) {
    console.error("Get site logs error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  req.params.siteId = "all";
  return getBySite(req, res);
};

export const update = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Log ID is required");
    }
    const result = await siteLogsRepository.updateLog(parseInt(id), req.body);
    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Update site log error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Log ID is required");
    }
    await siteLogsRepository.deleteLog(parseInt(id));
    return sendSuccess(res, null, { message: "Log deleted successfully" });
  } catch (error: any) {
    console.error("Delete site log error:", error);
    return sendServerError(res, error);
  }
};

export const bulkRemove = async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return sendError(res, "Invalid IDs provided");
    }
    const result = await siteLogsRepository.deleteLogs(ids);
    return sendSuccess(res, result);
  } catch (error: any) {
    console.error("Bulk delete site log error:", error);
    return sendServerError(res, error);
  }
};

export default { create, getBySite, getAll, update, remove, bulkRemove };
