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
  logActivity,
} from "@jouleops/shared";

const VALID_STATUSES = [
  "Open",
  "Pending",
  "In Progress",
  "In-progress",
  "Completed",
  "Cancelled",
];

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
    const { fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const instance = await pmInstancesRepository.getPMInstanceById(
      instanceId,
      fieldArray,
    );
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
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const {
      instance_id,
      maintenance_id,
      page,
      limit,
      status,
      frequency,
      asset_type,
      sortBy,
      sortOrder,
      fields,
      search,
      filters,
    } = req.query;
    let statusFilter = status as string | undefined;
    let frequencyFilter = frequency as string | undefined;
    let assetTypeFilter = asset_type as string | undefined;

    if (filters) {
      try {
        const parsedFilters =
          typeof filters === "string" ? JSON.parse(filters) : filters;
        if (Array.isArray(parsedFilters)) {
          const statusRule = parsedFilters.find((f: any) => f.fieldId === "status");
          if (statusRule) statusFilter = statusRule.value;

          const freqRule = parsedFilters.find((f: any) => f.fieldId === "frequency");
          if (freqRule) frequencyFilter = freqRule.value;

          const assetRule = parsedFilters.find((f: any) => f.fieldId === "asset_type");
          if (assetRule) assetTypeFilter = assetRule.value;
        }
      } catch (e) {
        console.error("[PM_INSTANCES_CONTROLLER] Error parsing filters:", e);
      }
    }

    const result = await pmInstancesRepository.getPMInstancesBySite(siteCode, {
      instance_id: instance_id as string | undefined,
      maintenance_id: maintenance_id as string | undefined,
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      status: statusFilter,
      frequency: frequencyFilter,
      asset_type: assetTypeFilter,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
      fields: fields ? (fields as string).split(",") : undefined,
      search: search as string | undefined,
      filters: filters as any | undefined,
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
    const { fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const instances = await pmInstancesRepository.getPMInstancesByAsset(
      assetId,
      fieldArray,
    );
    return sendSuccess(res, instances);
  } catch (error: any) {
    console.error("Get PM instances error:", error);
    return sendServerError(res, error);
  }
};

export const getPending = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const { days, fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const instances = await pmInstancesRepository.getPendingPMInstances(
      siteCode,
      parseInt(days as string) || 7,
      fieldArray,
    );
    return sendSuccess(res, instances);
  } catch (error: any) {
    console.error("Get pending PM instances error:", error);
    return sendServerError(res, error);
  }
};

export const getOverdue = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const { fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const instances = await pmInstancesRepository.getOverduePMInstances(
      siteCode,
      fieldArray,
    );
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
    const { status, client_sign, before_image, after_image } = req.body;
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

    // Use updatePMInstanceStatus for status + timestamps
    const instance = await pmInstancesRepository.updatePMInstanceStatus(
      instanceId,
      status,
      req.user?.user_id,
    );

    // If completing, also save signature and images
    if (
      status === "Completed" &&
      (client_sign || before_image || after_image)
    ) {
      const completionUpdates: Record<string, any> = {};
      if (client_sign) completionUpdates.client_sign = client_sign;
      if (before_image) completionUpdates.before_image = before_image;
      if (after_image) completionUpdates.after_image = after_image;

      const updated = await pmInstancesRepository.updatePMInstance(
        instanceId,
        completionUpdates,
      );
      return sendSuccess(res, updated);
    }

    // Log the activity
    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_STATUS",
      module: "PM",
      description: `Updated PM instance ${instanceId} status to ${status}`,
      metadata: { instanceId, status, siteCode: instance?.site_code },
    });

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
    if (progress === undefined) {
      return sendError(res, "progress is required");
    }

    const instance = await pmInstancesRepository.updatePMInstanceProgress(
      instanceId,
      progress,
    );

    // Log the activity
    logActivity({
      user_id: (req as any).user?.user_id,
      action: "UPDATE_PROGRESS",
      module: "PM",
      description: `Updated PM instance ${instanceId} progress to ${progress}`,
      metadata: { instanceId, progress, siteCode: instance?.site_code },
    });

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
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const stats = await pmInstancesRepository.getPMStats(siteCode);
    return sendSuccess(res, stats);
  } catch (error: any) {
    console.error("Get stats error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const {
      instance_id,
      maintenance_id,
      page,
      limit,
      status,
      frequency,
      asset_type,
      sortBy,
      sortOrder,
      fields,
      search,
      filters,
    } = req.query;
    let statusFilter = status as string | undefined;
    let frequencyFilter = frequency as string | undefined;
    let assetTypeFilter = asset_type as string | undefined;

    if (filters) {
      try {
        const parsedFilters =
          typeof filters === "string" ? JSON.parse(filters) : filters;
        if (Array.isArray(parsedFilters)) {
          const statusRule = parsedFilters.find((f: any) => f.fieldId === "status");
          if (statusRule) statusFilter = statusRule.value;

          const freqRule = parsedFilters.find((f: any) => f.fieldId === "frequency");
          if (freqRule) frequencyFilter = freqRule.value;

          const assetRule = parsedFilters.find((f: any) => f.fieldId === "asset_type");
          if (assetRule) assetTypeFilter = assetRule.value;
        }
      } catch (e) {
        console.error("[PM_INSTANCES_CONTROLLER] Error parsing filters:", e);
      }
    }

    const result = await pmInstancesRepository.getAllPMInstances({
      instance_id: instance_id as string | undefined,
      maintenance_id: maintenance_id as string | undefined,
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      status: statusFilter,
      frequency: frequencyFilter,
      asset_type: assetTypeFilter,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
      fields: fields ? (fields as string).split(",") : undefined,
      search: search as string | undefined,
      filters: filters as any | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get PM instances error:", error);
    return sendServerError(res, error);
  }
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
