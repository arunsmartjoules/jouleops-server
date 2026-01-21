import whatsappGroupService from "../services/whatsappGroupService.js";
import whatsappTemplateService from "../services/whatsappTemplateService.js";
import supabase from "../config/supabase.js";
import { logActivity } from "../services/logsService.js";

/**
 * WhatsApp Controller
 */

// --- Group Mappings ---

export const getAllMappings = async (req, res) => {
  try {
    const mappings = await whatsappGroupService.getMappings();
    res.json({ success: true, data: mappings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createMapping = async (req, res) => {
  try {
    const mapping = await whatsappGroupService.createMapping(req.body);
    await logActivity({
      user_id: req.user?.user_id,
      action: "WA_MAPPING_CREATE",
      module: "WHATSAPP",
      description: `Created WhatsApp mapping for site ${mapping.site_name}`,
      metadata: { mapping_id: mapping.id },
      ip_address: req.ip,
    });
    res.status(201).json({ success: true, data: mapping });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateMapping = async (req, res) => {
  try {
    const mapping = await whatsappGroupService.updateMapping(
      req.params.id,
      req.body,
    );
    await logActivity({
      user_id: req.user?.user_id,
      action: "WA_MAPPING_UPDATE",
      module: "WHATSAPP",
      description: `Updated WhatsApp mapping for site ${mapping.site_name}`,
      metadata: { mapping_id: mapping.id },
      ip_address: req.ip,
    });
    res.json({ success: true, data: mapping });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteMapping = async (req, res) => {
  try {
    await whatsappGroupService.deleteMapping(req.params.id);
    await logActivity({
      user_id: req.user?.user_id,
      action: "WA_MAPPING_DELETE",
      module: "WHATSAPP",
      description: `Deleted WhatsApp mapping`,
      metadata: { mapping_id: req.params.id },
      ip_address: req.ip,
    });
    res.json({ success: true, message: "Mapping deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// --- Templates ---

export const getAllTemplates = async (req, res) => {
  try {
    const templates = await whatsappTemplateService.getTemplates();
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const template = await whatsappTemplateService.updateTemplate(
      req.params.id,
      {
        ...req.body,
        updated_by: req.user?.email || req.user?.user_id,
        updated_at: new Date().toISOString(),
      },
    );
    await logActivity({
      user_id: req.user?.user_id,
      action: "WA_TEMPLATE_UPDATE",
      module: "WHATSAPP",
      description: `Updated WhatsApp template: ${template.template_key}`,
      metadata: { template_id: template.id },
      ip_address: req.ip,
    });
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// --- Message Logs ---

export const getMessageLogs = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("whatsapp_message_logs")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
};
