/**
 * PM Response Controller
 */

import pmResponseRepository from "../repositories/pmResponseRepository.ts";
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
} from "@jouleops/shared";
import pmChecklistRepository from "../repositories/pmChecklistRepository.ts";
import pmInstancesRepository from "../repositories/pmInstancesRepository.ts";
import { upsertPMInstanceTaskLineInFieldproxy } from "../services/fieldproxyService.ts";

export const create = async (req: AuthRequest, res: Response) => {
  try {
    // Stamp completed_by (user_id) + completed_at when an answer is provided.
    const hasAnswer =
      req.body.response_value !== undefined && req.body.response_value !== null;
    const responseInput = {
      ...req.body,
      completed_by: req.body.completed_by ?? (hasAnswer ? req.user?.user_id : undefined),
      completed_at: req.body.completed_at ?? (hasAnswer ? new Date() : undefined),
    };

    const response = await pmResponseRepository.create(responseInput);

    // Fire-and-forget: upsert pm_instance_task_line in Fieldproxy.
    Promise.all([
      pmInstancesRepository.getPMInstanceById(req.body.instance_id),
      pmChecklistRepository.getPMChecklistItemById(req.body.checklist_id),
      response.completed_by
        ? queryOne<{ name: string }>(
            `SELECT name FROM users WHERE id = $1`,
            [response.completed_by],
          )
        : Promise.resolve(null),
    ])
      .then(async ([instance, checklistItem, userRow]) => {
        if (!instance?.instance_id || !checklistItem?.task_name) {
          logActivity({
            action: "UPSERT_FIELDPROXY_PM_INSTANCE_TASK_LINE_SKIPPED",
            module: "PM",
            description:
              "Skipped fieldproxy pm_instance_task_line forward due to missing instance/checklist mapping",
            metadata: {
              instance_uuid: req.body.instance_id,
              checklist_uuid: req.body.checklist_id,
              has_instance_id: !!instance?.instance_id,
              has_task_name: !!checklistItem?.task_name,
            },
          }).catch(() => {});
          return;
        }

        const fpRes = await upsertPMInstanceTaskLineInFieldproxy({
          instance_id: instance.instance_id,
          task_name: checklistItem.task_name,
          status: req.body.response_value ?? "Pending",
          checklist_id: req.body.checklist_id,
          completed_by: userRow?.name ?? null,
          completed_on: response.completed_at
            ? new Date(response.completed_at).toISOString()
            : null,
          start_datetime: instance.start_datetime
            ? new Date(instance.start_datetime).toISOString()
            : null,
          end_datetime: instance.end_datetime
            ? new Date(instance.end_datetime).toISOString()
            : null,
        });

        logActivity({
          action: `UPSERT_FIELDPROXY_PM_INSTANCE_TASK_LINE_${fpRes.action.toUpperCase()}`,
          module: "PM",
          description: `Fieldproxy pm_instance_task_line ${fpRes.action} for instance ${instance.instance_id}`,
          metadata: {
            instance_id: instance.instance_id,
            checklist_id: req.body.checklist_id,
            task_name: checklistItem.task_name,
            status: req.body.response_value ?? "Pending",
            fieldproxy_response: fpRes.result,
          },
        }).catch(() => {});
      })
      .catch((err: Error) => {
        logActivity({
          action: "UPSERT_FIELDPROXY_PM_INSTANCE_TASK_LINE_FAILED",
          module: "PM",
          description: `Failed to upsert fieldproxy pm_instance_task_line row: ${err.message}`,
          metadata: {
            instance_uuid: req.body.instance_id,
            checklist_uuid: req.body.checklist_id,
            error: err.message,
          },
        }).catch(() => {});
      });

    logActivity({
      user_id: req.user?.user_id,
      action: "SAVE_PM_RESPONSE",
      module: "PM",
      description: `PM response saved for instance ${req.body.instance_id}`,
      metadata: {
        instance_id: req.body.instance_id,
        checklist_id: req.body.checklist_id,
        user_name: req.user?.name,
        employee_code: req.user?.employee_code,
      },
    }).catch(() => {});

    return sendCreated(res, response);
  } catch (error: any) {
    console.error("Create PM response error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return sendError(res, "ID is required");
    const { fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const response = await pmResponseRepository.getById(id, fieldArray);
    if (!response) return sendNotFound(res, "PM Response");
    return sendSuccess(res, response);
  } catch (error: any) {
    console.error("Get PM response error:", error);
    return sendServerError(res, error);
  }
};

export const getByInstance = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) return sendError(res, "Instance ID is required");
    const { fields } = req.query;
    const fieldArray = fields ? (fields as string).split(",") : undefined;
    const responses = await pmResponseRepository.getByInstance(
      instanceId,
      fieldArray,
    );
    return sendSuccess(res, responses);
  } catch (error: any) {
    console.error("Get PM responses error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return sendError(res, "ID is required");
    const response = await pmResponseRepository.update(id, req.body);

    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_PM_RESPONSE",
      module: "PM",
      description: `PM response ${id} updated`,
      metadata: {
        id,
        instance_id: response.instance_id,
        user_name: req.user?.name,
        employee_code: req.user?.employee_code,
      },
    }).catch(() => {});

    return sendSuccess(res, response);
  } catch (error: any) {
    console.error("Update PM response error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return sendError(res, "ID is required");
    const deleted = await pmResponseRepository.remove(id);
    if (!deleted) return sendNotFound(res, "PM Response");
    return sendSuccess(res, null, { message: "Deleted successfully" });
  } catch (error: any) {
    console.error("Delete PM response error:", error);
    return sendServerError(res, error);
  }
};

export default {
  create,
  getById,
  getByInstance,
  update,
  remove,
};
