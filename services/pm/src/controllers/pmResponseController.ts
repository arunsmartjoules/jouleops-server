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
} from "@jouleops/shared";

export const create = async (req: AuthRequest, res: Response) => {
  try {
    const response = await pmResponseRepository.create(req.body);

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
