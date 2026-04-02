import type { Request, Response, NextFunction } from "express";
import logMasterSiteRepository from "../repositories/logMasterSiteRepository.ts";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@jouleops/shared";

/**
 * Get all log master site entries
 */
export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      log_id,
      log_name,
      frequency,
      site_id,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await logMasterSiteRepository.getAllLogMasterSites({
      log_id: log_id as string,
      log_name: log_name as string,
      frequency: frequency as string,
      site_id: site_id as string,
      search: search as string,
      page: page as string,
      limit: limit as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as "asc" | "desc",
    });

    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

/**
 * Create a new log master site entry
 */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await logMasterSiteRepository.createLogMasterSite(req.body);
    return sendCreated(res, data, "Log master site entry created successfully");
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

/**
 * Partially update an existing log master site entry
 */
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "ID is required");
    }
    const data = await logMasterSiteRepository.updateLogMasterSite(id, req.body);
    return sendSuccess(res, data, { message: "Log master site entry updated successfully" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

/**
 * Delete a log master site entry
 */
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "ID is required");
    }
    const success = await logMasterSiteRepository.deleteLogMasterSite(id);
    if (!success) {
      return sendNotFound(res, "Log master site entry");
    }
    return sendSuccess(res, null, {
      message: "Log master site entry deleted successfully",
    });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

/**
 * Bulk delete log master site entries
 */
export const bulkDelete = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "Invalid input: ids must be a non-empty array");
    }
    await logMasterSiteRepository.bulkDeleteLogMasterSites(ids);
    return sendSuccess(res, null, {
      message: "Log master site entries deleted successfully",
    });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export default {
  getAll,
  create,
  update,
  remove,
  bulkDelete,
};
