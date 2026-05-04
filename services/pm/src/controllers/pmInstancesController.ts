/**
 * PM Instances Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import pmInstancesRepository from "../repositories/pmInstancesRepository.ts";
import type { Request, Response } from "express";
import type { AuthRequest } from "../middleware/auth.ts";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
  logActivity,
  queryOne,
  query,
} from "@jouleops/shared";
import {
  updatePMInstanceInFieldproxy,
  updateTaskManagementInFieldproxy,
  upsertPMInstanceTaskLineInFieldproxy,
  type PMFieldproxyPayload,
  type PMInstanceTaskLinePayload,
} from "../services/fieldproxyService.ts";

type FieldproxySyncError = { scope: string; id: string; error: string };

// ─── Helper: get employee_code from user_id ─────────────────────────────────
async function getEmployeeCode(userId?: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const row = await queryOne<{ employee_code: string }>(
      `SELECT employee_code FROM users WHERE user_id = $1`,
      [userId],
    );
    return row?.employee_code ?? null;
  } catch (error) {
    console.warn(
      "[PM_INSTANCES_CONTROLLER] Failed to resolve employee_code from users table:",
      error,
    );
    return null;
  }
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

// ─── Helper: load all checklists for an instance and upsert each to Fieldproxy ──
/**
 * Reads all checklist items + their responses (LEFT JOIN) for the given instance,
 * resolves the executor's user_name, and upserts each row in
 * Fieldproxy sheet "pm_instance_task_line".
 *
 * Includes unanswered checklists (status null) so the sheet stays in sync.
 *
 * Used by both live updates (fire-and-forget) and the manual sync endpoints.
 */
async function syncAllChecklistsToFieldproxy(
  instance: any,
): Promise<{ created: number; updated: number; skipped: number; errors: FieldproxySyncError[] }> {
  const summary = { created: 0, updated: 0, skipped: 0, errors: [] as FieldproxySyncError[] };
  if (!instance?.instance_id || !instance?.id) return summary;

  const startISO = instance.start_datetime
    ? new Date(instance.start_datetime).toISOString()
    : undefined;
  const endISO = instance.end_datetime
    ? new Date(instance.end_datetime).toISOString()
    : undefined;

  const rows = await query<{
    checklist_id: string;
    task_name: string | null;
    response_value: string | null;
    completed_at: Date | null;
    completed_by_code: string | null;
  }>(
    `SELECT
       c.id::text AS checklist_id,
       c.task_name,
       r.response_value,
       r.completed_at,
       u.employee_code AS completed_by_code
     FROM pm_checklist c
     JOIN pm_instances pi ON c.checklist_id = pi.maintenance_id
     LEFT JOIN pm_checklist_responses r
       ON r.instance_id = pi.id::text AND r.checklist_id = c.id::text
     LEFT JOIN users u ON u.user_id = r.completed_by
     WHERE pi.id = $1
     ORDER BY c.sequence_no ASC NULLS LAST`,
    [instance.id],
  );

  for (const row of rows) {
    if (!row.task_name) continue;

    const payload: PMInstanceTaskLinePayload = {
      instance_id: instance.instance_id,
      task_name: row.task_name,
      checklist_id: row.checklist_id,
      status: row.response_value ?? null,
      completed_by: row.completed_by_code ?? null,
      completed_on: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      start_datetime: startISO ?? null,
      end_datetime: endISO ?? null,
    };

    try {
      const res = await upsertPMInstanceTaskLineInFieldproxy(payload);
      if (res.action === "created") summary.created += 1;
      else if (res.action === "updated") summary.updated += 1;
      else summary.skipped += 1;
    } catch (err: any) {
      summary.errors.push({
        scope: "pm_instance_task_line",
        id: `${instance.instance_id}:${row.checklist_id}`,
        error: err?.message || String(err),
      });
    }
  }

  return summary;
}

const VALID_STATUSES = [
  "Open",
  "Pending",
  "In Progress",
  "In-progress",
  "Completed",
  "Cancelled",
];

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
    const incomingStatus = cleanUpdateData.status as string | undefined;
    const normalizedStatus = incomingStatus?.toLowerCase().replace(/[\s-]/g, "");
    const previousStatusNormalized = (existing.status || "")
      .toLowerCase()
      .replace(/[\s-]/g, "");

    const movedToInProgress =
      normalizedStatus === "inprogress" && previousStatusNormalized !== "inprogress";
    const movedToCompleted =
      normalizedStatus === "completed" && previousStatusNormalized !== "completed";

    if (movedToInProgress && !cleanUpdateData.start_datetime) {
      cleanUpdateData.start_datetime = new Date();
    }

    if (movedToCompleted && !cleanUpdateData.end_datetime) {
      cleanUpdateData.end_datetime = new Date();
    }
    
    const instance = await pmInstancesRepository.updatePMInstance(
      instanceId,
      cleanUpdateData,
    );

    // Sync with Fieldproxy — fire and forget
    const assigneeCode =
      (await getEmployeeCode(instance?.assigned_to)) ??
      (await getEmployeeCode(req.user?.user_id)) ??
      undefined;
    const fpPayload: PMFieldproxyPayload = {
      instance_id: existing.instance_id,
      status: req.body.status || existing.status,
      progress: req.body.progress || existing.progress,
      before_image: req.body.before_image,
      after_image: req.body.after_image,
      sjpl_sign: req.body.client_sign || instance?.client_sign,
      start_datetime: instance?.start_datetime?.toISOString?.() || undefined,
      end_datetime: instance?.end_datetime?.toISOString?.() || undefined,
      assigned_to: assigneeCode,
    };
    syncToFieldproxy(instance, fpPayload).catch(() => {});
    syncAllChecklistsToFieldproxy(instance).catch(() => {});

    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_PM_INSTANCE",
      module: "PM",
      description: `PM instance ${instanceId} updated`,
      metadata: {
        instanceId,
        updated_fields: Object.keys(req.body),
        user_name: req.user?.name,
        employee_code: req.user?.employee_code,
      },
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
      metadata: {
        instanceId,
        status,
        siteCode: instance?.site_code,
        user_name: req.user?.name,
        employee_code: req.user?.employee_code,
      },
    }).catch(() => {});

    // Sync with Fieldproxy — fire and forget (both pm_instance + task_management)
    const assigneeCode =
      (await getEmployeeCode(instance?.assigned_to)) ??
      (await getEmployeeCode(req.user?.user_id)) ??
      undefined;
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
      assigned_to: assigneeCode,
    };
    syncToFieldproxy(instance, fpPayload).catch(() => {});
    syncAllChecklistsToFieldproxy(instance).catch(() => {});

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
      metadata: {
        instanceId,
        progress,
        siteCode: instance?.site_code,
        user_name: req.user?.name,
        employee_code: req.user?.employee_code,
      },
    }).catch(() => {});

    // Sync progress to Fieldproxy pm_instance — fire and forget
    const assigneeCode =
      (await getEmployeeCode(instance?.assigned_to)) ??
      (await getEmployeeCode(req.user?.user_id)) ??
      undefined;
    const fpPayload: PMFieldproxyPayload = {
      instance_id: instance?.instance_id || instanceId,
      progress: String(progress),
      assigned_to: assigneeCode,
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

async function syncSingleInstanceToFieldproxy(instance: any): Promise<{
  pmInstanceSynced: number;
  taskManagementSynced: number;
  taskLineCreated: number;
  taskLineUpdated: number;
  taskLineSkipped: number;
  responsesSelected: number;
  errors: FieldproxySyncError[];
}> {
  let pmInstanceSynced = 0;
  let taskManagementSynced = 0;
  const errors: FieldproxySyncError[] = [];

  const pmPayload: PMFieldproxyPayload = {
    instance_id: instance.instance_id,
    status: instance.status || undefined,
    progress: instance.progress || undefined,
    before_image: instance.before_image || undefined,
    after_image: instance.after_image || undefined,
    sjpl_sign: instance.client_sign || undefined,
    start_datetime: instance.start_datetime
      ? new Date(instance.start_datetime).toISOString()
      : undefined,
    end_datetime: instance.end_datetime
      ? new Date(instance.end_datetime).toISOString()
      : undefined,
    assigned_to: (await getEmployeeCode(instance.assigned_to)) ?? undefined,
  };

  try {
    const pmRes = await updatePMInstanceInFieldproxy(pmPayload);
    if (!pmRes.error) pmInstanceSynced += 1;
  } catch (err: any) {
    errors.push({
      scope: "pm_instance",
      id: instance.instance_id,
      error: err?.message || String(err),
    });
  }

  try {
    const tmRes = await updateTaskManagementInFieldproxy({
      instance_id: instance.instance_id,
      task_status: instance.status || undefined,
      time_log_start: pmPayload.start_datetime,
      time_log_end: pmPayload.end_datetime,
      start_time: pmPayload.start_datetime,
      end_time: pmPayload.end_datetime,
      assigned_to: pmPayload.assigned_to,
      signature: pmPayload.sjpl_sign,
    });
    if (!tmRes.error) taskManagementSynced += 1;
  } catch (err: any) {
    errors.push({
      scope: "task_management",
      id: instance.instance_id,
      error: err?.message || String(err),
    });
  }

  const checklistResult = await syncAllChecklistsToFieldproxy(instance);
  errors.push(...checklistResult.errors);

  return {
    pmInstanceSynced,
    taskManagementSynced,
    taskLineCreated: checklistResult.created,
    taskLineUpdated: checklistResult.updated,
    taskLineSkipped: checklistResult.skipped,
    responsesSelected: checklistResult.created + checklistResult.updated + checklistResult.skipped,
    errors,
  };
}

export const syncFieldproxyByInstance = async (req: AuthRequest, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) return sendError(res, "Instance ID is required");

    const instance = await pmInstancesRepository.getPMInstanceById(instanceId);
    if (!instance) return sendNotFound(res, "PM instance");

    logActivity({
      user_id: req.user?.user_id,
      action: "SYNC_FIELDPROXY_PM_INSTANCE_START",
      module: "PM",
      description: `Manual fieldproxy sync started for PM ${instance.instance_id}`,
      metadata: { instance_id: instance.instance_id, instance_uuid: instance.id },
    }).catch(() => {});

    const result = await syncSingleInstanceToFieldproxy(instance);

    logActivity({
      user_id: req.user?.user_id,
      action: "SYNC_FIELDPROXY_PM_INSTANCE_SUMMARY",
      module: "PM",
      description: `Manual fieldproxy sync completed for PM ${instance.instance_id}`,
      metadata: {
        instance_id: instance.instance_id,
        instance_uuid: instance.id,
        counts: {
          pm_instance_synced: result.pmInstanceSynced,
          task_management_synced: result.taskManagementSynced,
          pm_instance_task_line_created: result.taskLineCreated,
          pm_instance_task_line_updated: result.taskLineUpdated,
          pm_instance_task_line_skipped: result.taskLineSkipped,
          responses_selected: result.responsesSelected,
          error_count: result.errors.length,
        },
        errors: result.errors.slice(0, 50),
      },
    }).catch(() => {});

    return sendSuccess(res, {
      instance_id: instance.instance_id,
      instance_uuid: instance.id,
      pm_instance_synced: result.pmInstanceSynced,
      task_management_synced: result.taskManagementSynced,
      pm_instance_task_line_created: result.taskLineCreated,
      pm_instance_task_line_updated: result.taskLineUpdated,
      pm_instance_task_line_skipped: result.taskLineSkipped,
      responses_selected: result.responsesSelected,
      errors: result.errors.slice(0, 100),
    });
  } catch (error: any) {
    console.error("Sync PM instance to Fieldproxy error:", error);
    return sendServerError(res, error);
  }
};

export const resyncFieldproxyHistory = async (req: AuthRequest, res: Response) => {
  try {
    const {
      site_code,
      from_date,
      to_date,
      limit = "200",
    } = (req.query || {}) as Record<string, string>;
    const bodyInstanceIds = Array.isArray(req.body?.instance_ids)
      ? req.body.instance_ids.map((v: any) => String(v)).filter(Boolean)
      : [];

    const instanceFilters: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (bodyInstanceIds.length > 0) {
      instanceFilters.push(
        `(pm_instances.id::text = ANY($${idx}::text[]) OR pm_instances.instance_id = ANY($${idx}::text[]))`,
      );
      params.push(bodyInstanceIds);
      idx += 1;
    }

    if (site_code) {
      instanceFilters.push(`pm_instances.site_code = $${idx}`);
      params.push(site_code);
      idx += 1;
    }
    if (from_date) {
      instanceFilters.push(`pm_instances.start_due_date >= $${idx}::date`);
      params.push(from_date);
      idx += 1;
    }
    if (to_date) {
      instanceFilters.push(`pm_instances.start_due_date <= $${idx}::date`);
      params.push(to_date);
      idx += 1;
    }

    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
    params.push(safeLimit);

    const instanceWhereClause =
      instanceFilters.length > 0 ? `WHERE ${instanceFilters.join(" AND ")}` : "";
    const instances = await query<any>(
      `SELECT id, instance_id, status, progress, before_image, after_image, client_sign,
              start_datetime, end_datetime, assigned_to
       FROM pm_instances
       ${instanceWhereClause}
       ORDER BY updated_at DESC
       LIMIT $${idx}`,
      params,
    );

    let pmInstanceSynced = 0;
    let taskManagementSynced = 0;
    let taskLineCreated = 0;
    let taskLineUpdated = 0;
    let taskLineSkipped = 0;
    const errors: FieldproxySyncError[] = [];

    for (const inst of instances) {
      const result = await syncSingleInstanceToFieldproxy(inst);
      pmInstanceSynced += result.pmInstanceSynced;
      taskManagementSynced += result.taskManagementSynced;
      taskLineCreated += result.taskLineCreated;
      taskLineUpdated += result.taskLineUpdated;
      taskLineSkipped += result.taskLineSkipped;
      errors.push(...result.errors);
    }

    const responsesSelected = taskLineCreated + taskLineUpdated + taskLineSkipped;

    logActivity({
      user_id: req.user?.user_id,
      action: "RESYNC_FIELDPROXY_PM_HISTORY",
      module: "PM",
      description: "Manual PM history resync to Fieldproxy executed",
      metadata: {
        filter: { site_code: site_code || null, from_date: from_date || null, to_date: to_date || null, limit: safeLimit },
        counts: {
          instances_selected: instances.length,
          responses_selected: responsesSelected,
          pm_instance_synced: pmInstanceSynced,
          task_management_synced: taskManagementSynced,
          pm_instance_task_line_created: taskLineCreated,
          pm_instance_task_line_updated: taskLineUpdated,
          pm_instance_task_line_skipped: taskLineSkipped,
          error_count: errors.length,
        },
      },
    }).catch(() => {});

    return sendSuccess(res, {
      instances_selected: instances.length,
      responses_selected: responsesSelected,
      pm_instance_synced: pmInstanceSynced,
      task_management_synced: taskManagementSynced,
      pm_instance_task_line_created: taskLineCreated,
      pm_instance_task_line_updated: taskLineUpdated,
      pm_instance_task_line_skipped: taskLineSkipped,
      errors: errors.slice(0, 100),
    });
  } catch (error: any) {
    console.error("Resync PM fieldproxy history error:", error);
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
  syncFieldproxyByInstance,
  resyncFieldproxyHistory,
  remove,
  getStats,
};
