/**
 * WhatsApp Controller
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

/**
 * Mask the API token for security in the UI
 * e.g. "whapi_token_123456789" -> "whapi_t...89"
 */
function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 10) return "****";
  return `${token.substring(0, 7)}...${token.slice(-4)}`;
}

// --- Channels ---

export const getAllChannels = async (req: Request, res: Response) => {
  try {
    const channels = await whatsappRepository.getChannels();
    const maskedChannels = channels.map((c) => ({
      ...c,
      api_token: maskToken(c.api_token),
    }));
    return sendSuccess(res, maskedChannels);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const createChannel = async (req: AuthRequest, res: Response) => {
  try {
    const channel = await whatsappRepository.createChannel(req.body);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_CHANNEL_CREATE",
        module: "WHATSAPP",
        description: `Created WhatsApp channel: ${channel.channel_name}`,
        metadata: { channel_id: channel.id },
        ip_address: req.ip,
      });
    }

    return sendCreated(res, {
      ...channel,
      api_token: maskToken(channel.api_token),
    });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const updateChannel = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Channel ID is required");
    }
    const updateData = { ...req.body };
    // If the token is masked, don't update it
    if (updateData.api_token && updateData.api_token.includes("...")) {
      delete updateData.api_token;
    }

    const channel = await whatsappRepository.updateChannel(id, updateData);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_CHANNEL_UPDATE",
        module: "WHATSAPP",
        description: `Updated WhatsApp channel: ${channel.channel_name}`,
        metadata: { channel_id: channel.id },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, {
      ...channel,
      api_token: maskToken(channel.api_token),
    });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const deleteChannel = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Channel ID is required");
    }
    await whatsappRepository.deleteChannel(id);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_CHANNEL_DELETE",
        module: "WHATSAPP",
        description: `Deleted WhatsApp channel`,
        metadata: { channel_id: req.params.id },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, null, { message: "Channel deleted" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

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

export const createTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { template_key, template_name, template_content } = req.body;
    if (!template_key || !template_content) {
      return sendError(res, "template_key and template_content are required");
    }

    const template = await whatsappRepository.createTemplate({
      ...req.body,
      created_by: req.user?.email || req.user?.user_id || "system",
    });

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_TEMPLATE_CREATE",
        module: "WHATSAPP",
        description: `Created new WhatsApp template for: ${template.template_key}`,
        metadata: { template_id: template.id },
        ip_address: req.ip,
      });
    }

    return sendCreated(res, template, "Template created successfully");
  } catch (error: any) {
    console.error("createTemplate Error:", error);
    return sendServerError(
      res,
      Object.assign(new Error("Failed to create template"), {
        original: error,
      }),
    );
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

export const deleteTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return sendError(res, "Template ID is required");
    }

    await whatsappRepository.deleteTemplate(id);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "WA_TEMPLATE_DELETE",
        module: "WHATSAPP",
        description: `Deleted WhatsApp template with ID: ${id}`,
        metadata: { template_id: id },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, null, { message: "Template deleted" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const getTemplateStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.params;
    if (!status) {
      return sendError(res, "Status parameter is required");
    }
    const template = await whatsappRepository.getTemplateByKey(status);
    if (!template) {
      return sendError(res, `Template not found for status: ${status}`, {
        status: 404,
      });
    }
    return sendSuccess(res, template);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

// --- WHAPI Sending Logic ---

export const sendWhatsAppMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { site_code, message, ticket_no, template_key } = req.body;

    if (!site_code || !message) {
      return sendError(res, "site_code and message are required in the body");
    }

    // Resolve the dynamically mapped WHAPI channel token
    const mapping =
      await whatsappRepository.getActiveMappingWithToken(site_code);

    if (!mapping || !mapping.api_token || !mapping.whatsapp_group_id) {
      return sendError(
        res,
        "No active WhatsApp mapping or channel found for this site",
      );
    }

    // Call WHAPI directly
    const whapiResponse = await globalThis.fetch(
      "https://gate.whapi.cloud/messages/text",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${mapping.api_token}`,
        },
        body: JSON.stringify({
          typing_time: 0,
          to: mapping.whatsapp_group_id,
          body: message,
        }),
      },
    );

    let data;
    try {
      data = await whapiResponse.json();
    } catch {
      data = { error: "Non-JSON response from WHAPI" };
    }

    // Log the message activity using the global logActivity
    await logActivity({
      user_id: "system",
      action: "WA_MESSAGE_SEND",
      module: "WHATSAPP",
      description: `WhatsApp message ${whapiResponse.ok ? "sent" : "failed"} to ${mapping.whatsapp_group_name || mapping.whatsapp_group_id}`,
      metadata: {
        ticket_no,
        site_code,
        template_key: template_key || "custom",
        recipient: mapping.whatsapp_group_id,
        message_content: message,
        status: whapiResponse.ok ? "sent" : "failed",
        error_message: whapiResponse.ok ? undefined : JSON.stringify(data),
      },
    });

    if (!whapiResponse.ok) {
      console.error("WHAPI Error:", data);
      return sendError(res, "Failed to send WhatsApp message");
    }

    return sendSuccess(res, data, {
      message: "WhatsApp message sent successfully",
    });
  } catch (error: any) {
    console.error("sendWhatsAppMessage Error:", error);
    return sendServerError(res, error);
  }
};

export default {
  getAllChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  getAllMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  bulkDeleteMappings,
  getAllTemplates,
  getTemplateStatus,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendWhatsAppMessage,
};
