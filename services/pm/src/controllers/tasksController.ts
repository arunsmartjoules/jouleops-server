/**
 * Tasks Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import tasksRepository from "../repositories/tasksRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@jouleops/shared";

const VALID_STATUSES = ["Pending", "In Progress", "Completed", "Cancelled"];

export const create = async (req: Request, res: Response) => {
  try {
    const task = await tasksRepository.createTask(req.body);
    return sendCreated(res, task);
  } catch (error: any) {
    console.error("Create task error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      return sendError(res, "Task ID is required");
    }
    const task = await tasksRepository.getTaskById(taskId);
    if (!task) {
      return sendNotFound(res, "Task");
    }
    return sendSuccess(res, task);
  } catch (error: any) {
    console.error("Get task error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const {
      page,
      limit,
      task_status,
      priority,
      assigned_to,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await tasksRepository.getTasksBySite(siteCode, {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      task_status: task_status as string | undefined,
      priority: priority as string | undefined,
      assigned_to: assigned_to as string | undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get tasks error:", error);
    return sendServerError(res, error);
  }
};

export const getByUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, "User ID is required");
    }
    const { task_status, limit } = req.query;
    const tasks = await tasksRepository.getTasksByUser(userId, {
      task_status: task_status as string | undefined,
      limit: parseInt(limit as string) || 20,
    });
    return sendSuccess(res, tasks);
  } catch (error: any) {
    console.error("Get tasks error:", error);
    return sendServerError(res, error);
  }
};

export const getDueToday = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const tasks = await tasksRepository.getTasksDueToday(siteCode);
    return sendSuccess(res, tasks);
  } catch (error: any) {
    console.error("Get tasks error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      return sendError(res, "Task ID is required");
    }
    const existing = await tasksRepository.getTaskById(taskId);
    if (!existing) {
      return sendNotFound(res, "Task");
    }

    const task = await tasksRepository.updateTask(taskId, req.body);
    return sendSuccess(res, task);
  } catch (error: any) {
    console.error("Update task error:", error);
    return sendServerError(res, error);
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      return sendError(res, "Task ID is required");
    }
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return sendError(
        res,
        `status must be one of: ${VALID_STATUSES.join(", ")}`,
      );
    }

    const existing = await tasksRepository.getTaskById(taskId);
    if (!existing) {
      return sendNotFound(res, "Task");
    }

    const task = await tasksRepository.updateTaskStatus(taskId, status);
    return sendSuccess(res, task);
  } catch (error: any) {
    console.error("Update task status error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    if (!taskId) {
      return sendError(res, "Task ID is required");
    }
    const existing = await tasksRepository.getTaskById(taskId);
    if (!existing) {
      return sendNotFound(res, "Task");
    }

    await tasksRepository.deleteTask(taskId);
    return sendSuccess(res, null, { message: "Task deleted successfully" });
  } catch (error: any) {
    console.error("Delete task error:", error);
    return sendServerError(res, error);
  }
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const stats = await tasksRepository.getTaskStats(siteCode);
    return sendSuccess(res, stats);
  } catch (error: any) {
    console.error("Get stats error:", error);
    return sendServerError(res, error);
  }
};

export default {
  create,
  getById,
  getBySite,
  getByUser,
  getDueToday,
  update,
  updateStatus,
  remove,
  getStats,
};
