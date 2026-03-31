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
  queryOne,
} from "@jouleops/shared";
import {
  updatePMInstanceInFieldproxy,
  updateTaskManagementInFieldproxy,
  type PMFieldproxyPayload,
} from "../services/fieldproxyService.ts";

// ─── Helper: get employee_code from user_id ─────────────────────────────────
async function getEmployeeCode(userId?: string): Promise<string | null> {
  if (!userId) return null;
  const row = await queryOne<{ employee_code: string }>(
    `SELECT employee_code FROM users WHERE id = $1`,
    [userId],
  );
  return row?.employee_code ?? null;
}

// ─── Helper: fire-and-forget Fieldproxy sync for PM ─────────────────────────
/**
 * Syncs PM data to both pm_instance and task_management sheets in Fieldproxy.
 * All results (success + error) are logged to activity_logs.
 */
async function syncToFieldproxy(
  instance: any,
  pmPayload: PMFieldproxyPayload,
  taskPayload?: { time_log_start?: string; time_log_end?: string; assigned_to?: string },
): Promise<void> {
  // 1. Sync pm_instance sheet
  updatePMInstanceInFieldproxy(pmPayload)
    .then((result) => {
      logActivity({
        action: "LOOKUP_FIELDPROXY_PM_INSTANCE",
        module: "PM",
        description: `Fieldproxy lookup for PM instance ${pmPayload.instance_id}`,
        metadata: { instance_id: pmPayload.instance_id, fieldproxy_response: result.lookup },
      }).catch(() => {});

      if (result.update) {
        logActivity({
          action: "UPDATE_FIELDPROXY_PM_INSTANCE",
          module: "PM",
          description: `PM instance ${pmPayload.instance_id} updated in Fieldproxy pm_instance successfully`,
          metadata: { instance_id: pmPayload.instance_id, fieldproxy_response: result.update },
        }).catch(() => {});
      } else if (result.error) {
        logActivity({
          action: "UPDATE_FIELDPROXY_PM_INSTANCE_FAILED",
          module: "PM",
          description: `Fieldproxy pm_instance update for ${pmPayload.instance_id} skipped: ${result.error}`,
          metadata: { instance_id: pmPayload.instance_id, error: result.error, lookup_response: result.lookup },
        }).catch(() => {});
      }
    })
    .catch((err: Error) => {
      console.error("[FIELDPROXY_PM] pm_instance update failed:", err);
      logActivity({
        action: "UPDATE_FIELDPROXY_PM_INSTANCE_FAILED",
        module: "PM",
        description: `Failed to update PM instance ${pmPayload.instance_id} in Fieldproxy pm_instance: ${err.message}`,
        metadata: { instance_id: pmPayload.instance_id, error: err.message },
      }).catch(() => {});
    });

  // 2. Sync task_management sheet
  const taskData = {
    instance_id: pmPayload.instance_id,
    task_status: pmPayload.status,
    time_log_start: pmPayload.start_datetime || taskPayload?.time_log_start,
    time_log_end: pmPayload.end_datetime || taskPayload?.time_log_end,
    assigned_to: pmPayload.assigned_to || taskPayload?.assigned_to,
  };

  updateTaskManagementInFieldproxy(taskData)
    .then((result) => {
      logActivity({
        action: "LOOKUP_FIELDPROXY_TASK_MANAGEMENT",
        module: "PM",
        description: `Fieldproxy lookup for task_management (source_reference_id=${pmPayload.instance_id})`,
        metadata: { instance_id: pmPayload.instance_id, fieldproxy_response: result.lookup },
      }).catch(() => {});

      if (result.update) {
        logActivity({
          action: "UPDATE_FIELDPROXY_TASK_MANAGEMENT",
          module: "PM",
          description: `Task management for PM ${pmPayload.instance_id} updated in Fieldproxy successfully`,
          metadata: { instance_id: pmPayload.instance_id, fieldproxy_response: result.update },
        }).catch(() => {});
      } else if (result.error) {
        logActivity({
          action: "UPDATE_FIELDPROXY_TASK_MANAGEMENT_FAILED",
          module: "PM",
          description: `Fieldproxy task_management update for ${pmPayload.instance_id} skipped: ${result.error}`,
          metadata: { instance_id: pmPayload.instance_id, error: result.error, lookup_response: result.lookup },
        }).catch(() => {});
      }
    })
    .catch((err: Error) => {
      console.error("[FIELDPROXY_PM] task_management update failed:", err);
      logActivity({
        action: "UPDATE_FIELDPROXY_TASK_MANAGEMENT_FAILED",
        module: "PM",
        description: `Failed to update task_management for PM ${pmPayload.instance_id} in Fieldproxy: ${err.message}`,
        metadata: { instance_id: pmPayload.instance_id, error: err.message },
      }).catch(() => {});
    });
}

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
      from_date,
      to_date,
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
      from_date: from_date as string | undefined,
      to_date: to_date as string | undefined,
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

export const update = async (req: AuthRequest, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) {
      return sendError(res, "Instance ID is required");
    }
    const existing = await pmInstancesRepository.getPMInstanceById(instanceId);
    if (!existing) {
      return sendNotFound(res, "PM instance");
    }

    // Ignore updated_at from body to prevent Postgres BigInt/Timestamp mismatch
    const { updated_at, ...cleanUpdateData } = req.body;
    
    const instance = await pmInstancesRepository.updatePMInstance(
      instanceId,
      cleanUpdateData,
    );

    // Sync with Fieldproxy — fire and forget
    const employeeCode = await getEmployeeCode(req.user?.user_id);
    const fpPayload: PMFieldproxyPayload = {
      instance_id: existing.instance_id,
      status: req.body.status || existing.status,
      progress: req.body.progress || existing.progress,
      before_image: req.body.before_image,
      after_image: req.body.after_image,
      sjpl_sign: req.body.client_sign,
      start_datetime: instance?.start_datetime?.toISOString?.() || undefined,
      end_datetime: instance?.end_datetime?.toISOString?.() || undefined,
      assigned_to: employeeCode || undefined,
    };
    syncToFieldproxy(instance, fpPayload).catch(() => {});

    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_PM_INSTANCE",
      module: "PM",
      description: `PM instance ${instanceId} updated`,
      metadata: { instanceId, updated_fields: Object.keys(req.body) },
    }).catch(() => {});

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
    let instance = await pmInstancesRepository.updatePMInstanceStatus(
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

      instance = await pmInstancesRepository.updatePMInstance(
        instanceId,
        completionUpdates,
      );
    }

    // Log the activity
    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_STATUS",
      module: "PM",
      description: `Updated PM instance ${instanceId} status to ${status}`,
      metadata: { instanceId, status, siteCode: instance?.site_code },
    }).catch(() => {});

    // Sync with Fieldproxy — fire and forget (both pm_instance + task_management)
    const employeeCode = await getEmployeeCode(req.user?.user_id);
    const fpPayload: PMFieldproxyPayload = {
      instance_id: existing.instance_id,
      status,
      progress: instance?.progress || existing.progress,
      before_image: before_image || instance?.before_image,
      after_image: after_image || instance?.after_image,
      sjpl_sign: client_sign || instance?.client_sign,
      start_datetime: status === "In Progress" || status === "In-progress"
        ? new Date().toISOString()
        : instance?.start_datetime?.toISOString?.() || undefined,
      end_datetime: status === "Completed"
        ? new Date().toISOString()
        : instance?.end_datetime?.toISOString?.() || undefined,
      assigned_to: employeeCode || undefined,
    };
    syncToFieldproxy(instance, fpPayload).catch(() => {});

    return sendSuccess(res, instance);
  } catch (error: any) {
    console.error("Update PM instance status error:", error);
    return sendServerError(res, error);
  }
};

export const updateProgress = async (req: AuthRequest, res: Response) => {
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
      user_id: req.user?.user_id,
      action: "UPDATE_PROGRESS",
      module: "PM",
      description: `Updated PM instance ${instanceId} progress to ${progress}`,
      metadata: { instanceId, progress, siteCode: instance?.site_code },
    }).catch(() => {});

    // Sync progress to Fieldproxy pm_instance — fire and forget
    const employeeCode = await getEmployeeCode(req.user?.user_id);
    const fpPayload: PMFieldproxyPayload = {
      instance_id: instance?.instance_id || instanceId,
      progress: String(progress),
      assigned_to: employeeCode || undefined,
    };
    syncToFieldproxy(instance, fpPayload).catch(() => {});

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
    const { from_date, to_date } = req.query;
    const stats = await pmInstancesRepository.getPMStats(
      siteCode,
      from_date as string | undefined,
      to_date as string | undefined,
    );
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
      from_date,
      to_date,
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
      from_date: from_date as string | undefined,
      to_date: to_date as string | undefined,
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
