import logsRepository from "../repositories/logsRepository.ts";
import type { Request, Response } from "express";
import { sendSuccess, sendServerError } from "@jouleops/shared";

export const getLogs = async (req: Request, res: Response) => {
  try {
    const { page, limit, search, from, to, module, action } = req.query;

    const logs = await logsRepository.getAllLogs({
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 50,
      search: search as string,
      from: from as string,
      to: to as string,
      module: module as string,
      action: action as string,
    });

    return sendSuccess(res, logs.data, {
      pagination: logs.pagination,
    });
  } catch (error: any) {
    console.error("Get logs error:", error);
    return sendServerError(res, error);
  }
};

export const createLog = async (req: Request, res: Response) => {
  try {
    const { action, module, description, device_info, metadata } = req.body;
    const user = (req as any).user;
    const user_id = user?.user_id || user?.id || null;

    // For unauthenticated logs, we still allow them but they will have user_id = null
    await logsRepository.logActivity({
      user_id: user_id,
      action: action || "APP_LOG",
      module: module || "MOBILE_APP",
      description: description || "App log entry",
      metadata: { device_info, ...metadata },
    });

    return sendSuccess(res, { success: true }, { message: "Log created" });
  } catch (error: any) {
    console.error("Create log error:", error);
    return sendServerError(res, error);
  }
};

export default {
  getLogs,
  createLog,
};
