/**
 * PM Checklist Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import pmChecklistRepository from "../repositories/pmChecklistRepository";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@smartops/shared";

export const create = async (req: Request, res: Response) => {
  try {
    const checklist = await pmChecklistRepository.createPMChecklist(req.body);
    return sendCreated(res, checklist);
  } catch (error: any) {
    console.error("Create PM checklist error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { checklistId } = req.params;
    if (!checklistId) {
      return sendError(res, "Checklist ID is required");
    }
    const checklist =
      await pmChecklistRepository.getPMChecklistById(checklistId);
    if (!checklist) {
      return sendNotFound(res, "PM checklist");
    }
    return sendSuccess(res, checklist);
  } catch (error: any) {
    console.error("Get PM checklist error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }
    const { asset_type, status } = req.query;
    const checklists = await pmChecklistRepository.getPMChecklistBySite(
      siteId,
      {
        asset_type: asset_type as string | undefined,
        status: status as string | undefined,
      },
    );
    return sendSuccess(res, checklists);
  } catch (error: any) {
    console.error("Get PM checklists error:", error);
    return sendServerError(res, error);
  }
};

export const getByMaintenanceType = async (req: Request, res: Response) => {
  try {
    const { maintenanceType } = req.params;
    if (!maintenanceType) {
      return sendError(res, "Maintenance Type is required");
    }
    const { site_id } = req.query;
    const checklists =
      await pmChecklistRepository.getPMChecklistByMaintenanceType(
        maintenanceType,
        site_id as string | undefined,
      );
    return sendSuccess(res, checklists);
  } catch (error: any) {
    console.error("Get PM checklists error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { checklistId } = req.params;
    if (!checklistId) {
      return sendError(res, "Checklist ID is required");
    }
    const existing =
      await pmChecklistRepository.getPMChecklistById(checklistId);
    if (!existing) {
      return sendNotFound(res, "PM checklist");
    }

    const checklist = await pmChecklistRepository.updatePMChecklist(
      checklistId,
      req.body,
    );
    return sendSuccess(res, checklist);
  } catch (error: any) {
    console.error("Update PM checklist error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { checklistId } = req.params;
    if (!checklistId) {
      return sendError(res, "Checklist ID is required");
    }
    const existing =
      await pmChecklistRepository.getPMChecklistById(checklistId);
    if (!existing) {
      return sendNotFound(res, "PM checklist");
    }

    await pmChecklistRepository.deletePMChecklist(checklistId);
    return sendSuccess(res, null, {
      message: "PM checklist deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete PM checklist error:", error);
    return sendServerError(res, error);
  }
};

// Checklist Responses
export const createResponse = async (req: Request, res: Response) => {
  try {
    const response = await pmChecklistRepository.createChecklistResponse(
      req.body,
    );
    return sendCreated(res, response);
  } catch (error: any) {
    console.error("Create checklist response error:", error);
    return sendServerError(res, error);
  }
};

export const getResponses = async (req: Request, res: Response) => {
  try {
    const { instanceId } = req.params;
    if (!instanceId) {
      return sendError(res, "Instance ID is required");
    }
    const responses =
      await pmChecklistRepository.getChecklistResponses(instanceId);
    return sendSuccess(res, responses);
  } catch (error: any) {
    console.error("Get checklist responses error:", error);
    return sendServerError(res, error);
  }
};

export const updateResponse = async (req: Request, res: Response) => {
  try {
    const { responseId } = req.params;
    if (!responseId) {
      return sendError(res, "Response ID is required");
    }
    const response = await pmChecklistRepository.updateChecklistResponse(
      parseInt(responseId),
      req.body,
    );
    return sendSuccess(res, response);
  } catch (error: any) {
    console.error("Update checklist response error:", error);
    return sendServerError(res, error);
  }
};

export default {
  create,
  getById,
  getBySite,
  getByMaintenanceType,
  update,
  remove,
  createResponse,
  getResponses,
  updateResponse,
};
