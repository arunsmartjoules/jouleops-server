/**
 * PM Instances Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import pmInstancesRepository from "../repositories/pmInstancesRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@smartops/shared";

const VALID_STATUSES = ["Pending", "In Progress", "Completed", "Cancelled"];

interface AuthRequest extends Request {
  user?: {
    user_id: string;
  };
}

export const create = async (req: Request, res: Response) => {
  try {
    const instance = await pmInstancesRepository.createPMInstance(req.body);
    return sendCreated(res, instance);
  } catch (error: any) {
    console.error("Create PM instance error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) {
      return sendError(res, "Instance ID is required");
    }
    const instance = await pmInstancesRepository.getPMInstanceById(instanceId);
    if (!instance) {
      return sendNotFound(res, "PM instance");
    }
    return sendSuccess(res, instance);
  } catch (error: any) {
    console.error("Get PM instance error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }
    const { page, limit, status, frequency, asset_type, sortBy, sortOrder } =
      req.query;
    const result = await pmInstancesRepository.getPMInstancesBySite(siteId, {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      status: status as string | undefined,
      frequency: frequency as string | undefined,
      asset_type: asset_type as string | undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get PM instances error:", error);
    return sendServerError(res, error);
  }
};

export const getByAsset = async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;
    if (!assetId) {
      return sendError(res, "Asset ID is required");
    }
    const instances =
      await pmInstancesRepository.getPMInstancesByAsset(assetId);
    return sendSuccess(res, instances);
  } catch (error: any) {
    console.error("Get PM instances error:", error);
    return sendServerError(res, error);
  }
};

export const getPending = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }
    const { days } = req.query;
    const instances = await pmInstancesRepository.getPendingPMInstances(
      siteId,
      parseInt(days as string) || 7,
    );
    return sendSuccess(res, instances);
  } catch (error: any) {
    console.error("Get pending PM instances error:", error);
    return sendServerError(res, error);
  }
};

export const getOverdue = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }
    const instances = await pmInstancesRepository.getOverduePMInstances(siteId);
    return sendSuccess(res, instances);
  } catch (error: any) {
    console.error("Get overdue PM instances error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) {
      return sendError(res, "Instance ID is required");
    }
    const existing = await pmInstancesRepository.getPMInstanceById(instanceId);
    if (!existing) {
      return sendNotFound(res, "PM instance");
    }

    const instance = await pmInstancesRepository.updatePMInstance(
      instanceId,
      req.body,
    );
    return sendSuccess(res, instance);
  } catch (error: any) {
    console.error("Update PM instance error:", error);
    return sendServerError(res, error);
  }
};

export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) {
      return sendError(res, "Instance ID is required");
    }
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return sendError(
        res,
        `status must be one of: ${VALID_STATUSES.join(", ")}`,
      );
    }

    const existing = await pmInstancesRepository.getPMInstanceById(instanceId);
    if (!existing) {
      return sendNotFound(res, "PM instance");
    }

    const instance = await pmInstancesRepository.updatePMInstanceStatus(
      instanceId,
      status,
      req.user?.user_id,
    );
    return sendSuccess(res, instance);
  } catch (error: any) {
    console.error("Update PM instance status error:", error);
    return sendServerError(res, error);
  }
};

export const updateProgress = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) {
      return sendError(res, "Instance ID is required");
    }
    const { progress } = req.body;
    if (progress === undefined || progress < 0 || progress > 100) {
      return sendError(res, "progress must be between 0 and 100");
    }

    const instance = await pmInstancesRepository.updatePMInstanceProgress(
      instanceId,
      progress,
    );
    return sendSuccess(res, instance);
  } catch (error: any) {
    console.error("Update progress error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) {
      return sendError(res, "Instance ID is required");
    }
    const existing = await pmInstancesRepository.getPMInstanceById(instanceId);
    if (!existing) {
      return sendNotFound(res, "PM instance");
    }

    await pmInstancesRepository.deletePMInstance(instanceId);
    return sendSuccess(res, null, {
      message: "PM instance deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete PM instance error:", error);
    return sendServerError(res, error);
  }
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }
    const stats = await pmInstancesRepository.getPMStats(siteId);
    return sendSuccess(res, stats);
  } catch (error: any) {
    console.error("Get stats error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  req.params.siteId = "all";
  return getBySite(req, res);
};

export default {
  create,
  getById,
  getAll,
  getBySite,
  getByAsset,
  getPending,
  getOverdue,
  update,
  updateStatus,
  updateProgress,
  remove,
  getStats,
};
