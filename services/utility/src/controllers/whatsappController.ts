/**
 * WhatsApp Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import whatsappRepository from "../repositories/whatsappRepository.ts";
import { logActivity } from "../repositories/logsRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendServerError,
} from "@jouleops/shared";

interface AuthRequest extends Request {
  user?: {
    user_id: string;
    email?: string;
  };
}

// --- Group Mappings ---

export const getAllMappings = async (req: Request, res: Response) => {
  try {
    const { site_code, whatsapp_group_id } = req.query;
    const mappings = await whatsappRepository.getMappings({
      site_code: site_code as string,
      whatsapp_group_id: whatsapp_group_id as string,
    });
    return sendSuccess(res, mappings);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const createMapping = async (req: AuthRequest, res: Response) => {
  try {
    const mapping = await whatsappRepository.createMapping(req.body);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_MAPPING_CREATE",
        module: "WHATSAPP",
        description: `Created WhatsApp mapping for site ${mapping.site_name}`,
        metadata: { mapping_id: mapping.id },
        ip_address: req.ip,
      });
    }

    return sendCreated(res, mapping);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const updateMapping = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Mapping ID is required");
    }
    const mapping = await whatsappRepository.updateMapping(id, req.body);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_MAPPING_UPDATE",
        module: "WHATSAPP",
        description: `Updated WhatsApp mapping for site ${mapping.site_name}`,
        metadata: { mapping_id: mapping.id },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, mapping);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const deleteMapping = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Mapping ID is required");
    }
    await whatsappRepository.deleteMapping(id);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_MAPPING_DELETE",
        module: "WHATSAPP",
        description: `Deleted WhatsApp mapping`,
        metadata: { mapping_id: req.params.id },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, null, { message: "Mapping deleted" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const bulkDeleteMappings = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "Mapping IDs are required");
    }

    await whatsappRepository.bulkDeleteMappings(ids);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_MAPPING_BULK_DELETE",
        module: "WHATSAPP",
        description: `Deleted ${ids.length} WhatsApp mappings`,
        metadata: { count: ids.length, ids },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, null, {
      message: `${ids.length} mappings deleted`,
    });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

// --- Templates ---

export const getAllTemplates = async (req: Request, res: Response) => {
  try {
    const templates = await whatsappRepository.getTemplates();
    return sendSuccess(res, templates);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const updateTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Template ID is required");
    }
    const template = await whatsappRepository.updateTemplate(id, {
      ...req.body,
      updated_by: req.user?.email || req.user?.user_id,
    });

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_TEMPLATE_UPDATE",
        module: "WHATSAPP",
        description: `Updated WhatsApp template: ${template.template_key}`,
        metadata: { template_id: template.id },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, template);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

// --- Message Logs ---

export const getMessageLogs = async (req: Request, res: Response) => {
  try {
    const data = await whatsappRepository.getMessageLogs(100);
    return sendSuccess(res, data);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export default {
  getAllMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  getAllTemplates,
  updateTemplate,
  getMessageLogs,
  bulkDeleteMappings,
};
