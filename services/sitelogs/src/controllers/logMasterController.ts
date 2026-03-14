import type { Request, Response, NextFunction } from "express";
import logMasterRepository from "../repositories/logMasterRepository.ts";
import { 
  sendSuccess, 
  sendCreated, 
  sendError, 
  sendNotFound, 
  sendServerError,
  AppError 
} from "@jouleops/shared";

/**
 * Get all log master entries
 */
export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      log_id,
      log_name,
      task_name,
      search,
      page,
      limit,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await logMasterRepository.getAllLogMasters({
      log_id: log_id as string,
      log_name: log_name as string,
      task_name: task_name as string,
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
 * Create a new log master entry
 */
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await logMasterRepository.createLogMaster(req.body);
    return sendCreated(res, data, "Log master entry created successfuly");
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

/**
 * Update an existing log master entry
 */
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
        return sendError(res, "ID is required");
    }
    const data = await logMasterRepository.updateLogMaster(id, req.body);
    return sendSuccess(res, data, { message: "Log master entry updated successfuly" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

/**
 * Delete a log master entry
 */
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!id) {
        return sendError(res, "ID is required");
    }
    const success = await logMasterRepository.deleteLogMaster(id);
    if (!success) {
      return sendNotFound(res, "Log master entry");
    }
    return sendSuccess(res, null, {
      message: "Log master entry deleted successfully",
    });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

/**
 * Bulk upsert log master entries
 */
export const bulkUpsert = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { logs } = req.body;
    if (!Array.isArray(logs)) {
      return sendError(res, "Invalid input: logs must be an array");
    }
    await logMasterRepository.bulkUpsertLogMasters(logs);
    return sendSuccess(res, null, {
      message: "Log master entries upserted successfully",
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
  bulkUpsert,
};
