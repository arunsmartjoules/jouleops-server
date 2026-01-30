import supabase from "../config/supabase.js";
import { formatComplaintForInsert } from "../models/complaintModel.js";
import whapiService from "./whapiService.js";
import whatsappGroupService from "./whatsappGroupService.js";
import whatsappTemplateService from "./whatsappTemplateService.js";
import sitesService from "./sitesService.js";
import logger from "../utils/logger.js";

// CREATE - Insert new complaint
export const createComplaint = async (data) => {
  const formattedData = formatComplaintForInsert(data);

  const { data: result, error } = await supabase
    .from("complaints")
    .insert(formattedData)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create complaint: ${error.message}`);
  }

  return result;
};

// READ - Get complaint by ticket_id or ticket_no
export const getComplaintById = async (ticketId) => {
  if (!ticketId) return null;

  // 1. Try UUID lookup first if it looks like one
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      ticketId,
    );

  if (isUuid) {
    const { data: byId, error: errorId } = await supabase
      .from("complaints")
      .select("*")
      .eq("ticket_id", ticketId)
      .maybeSingle();

    if (byId) return byId;
    if (errorId) logger.error(`Error searching by UUID: ${errorId.message}`);
  }

  // 2. Fallback: Search by ticket_no (human readable ID)
  const { data: byNo, error: errorNo } = await supabase
    .from("complaints")
    .select("*")
    .eq("ticket_no", ticketId)
    .maybeSingle();

  if (errorNo) {
    logger.error(`Error searching by ticket_no: ${errorNo.message}`);
    throw new Error(`Failed to get complaint: ${errorNo.message}`);
  }

  // 3. Last Fallback: Try Supabase standard 'id' (unlikely but safe)
  if (isUuid) {
    const { data: bySupabaseId, error: errorSid } = await supabase
      .from("complaints")
      .select("*")
      .eq("id", ticketId)
      .maybeSingle();

    if (bySupabaseId) return bySupabaseId;
    if (errorSid)
      logger.error(`Error searching by Supabase id: ${errorSid.message}`);
  }

  return byNo;
};

// READ - Get complaints by site with pagination
export const getComplaintsBySite = async (siteId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    status = null,
    category = null,
    fromDate = null,
    toDate = null,
    sortBy = "created_at",
    sortOrder = "desc",
  } = options;

  const offset = (page - 1) * limit;

  // Resolve numeric siteId or UUID to site_code if necessary,
  // as complaints table uses site_code in its site_id column
  let targetSiteId = siteId;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (siteId !== "all") {
    if (uuidRegex.test(siteId)) {
      const { data: site } = await supabase
        .from("sites")
        .select("site_code")
        .eq("id", siteId)
        .single();
      if (site?.site_code) {
        targetSiteId = site.site_code;
      }
    } else if (!isNaN(parseInt(siteId)) && String(siteId).length < 10) {
      const { data: site } = await supabase
        .from("sites")
        .select("site_code")
        .eq("site_id", siteId)
        .single();
      if (site?.site_code) {
        targetSiteId = site.site_code;
      }
    }
  }

  let query = supabase.from("complaints").select("*", { count: "exact" });

  if (targetSiteId !== "all") {
    query = query.eq("site_id", targetSiteId);
  }

  // Apply filters
  if (status && status !== "All") {
    query = query.eq("status", status);
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (fromDate) {
    query = query.gte("created_at", fromDate);
  }

  if (toDate) {
    query = query.lte("created_at", toDate);
  }

  // Apply sorting and pagination
  query = query
    .order(sortBy, { ascending: sortOrder === "asc" })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to get complaints: ${error.message}`);
  }

  return {
    data,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

// READ - Get recent complaints by message_id
export const getComplaintByMessageId = async (messageId) => {
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .eq("message_id", messageId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to get complaint: ${error.message}`);
  }

  return data;
};

// READ - Get recent complaints by group_id
export const getRecentComplaintsByGroup = async (groupId, limit = 5) => {
  const { data, error } = await supabase
    .from("complaints")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to get complaints: ${error.message}`);
  }

  return data;
};

// UPDATE - Update complaint
export const updateComplaint = async (
  ticketId,
  updateData,
  userContext = {},
) => {
  const existing = await getComplaintById(ticketId);
  if (!existing) throw new Error("Complaint not found");

  // Remove fields that shouldn't be updated, but keep those required for persistence
  const { ticket_id, ticket_no, created_at, ...allowedUpdates } = updateData;

  const { data, error } = await supabase
    .from("complaints")
    .update({ ...allowedUpdates, updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update complaint: ${error.message}`);
  }

  // If status changed, trigger notification
  if (allowedUpdates.status && allowedUpdates.status !== existing.status) {
    triggerWhatsAppNotification(data, userContext).catch((err) => {
      logger.error("Failed to trigger WhatsApp notification on update", {
        module: "COMPLAINTS_SERVICE",
        error: err.message,
        ticket_no: data.ticket_no,
      });
    });
  }

  return data;
};

// UPDATE - Update complaint status
export const updateComplaintStatus = async (
  ticketId,
  status,
  remarks = null,
  userContext = {},
) => {
  const existing = await getComplaintById(ticketId);
  if (!existing) throw new Error("Complaint not found");

  const updateData = { status };

  if (remarks) {
    updateData.internal_remarks = remarks;
    updateData.remarks = remarks;
  }

  // Add timestamp based on status
  if (status === "Resolved") {
    updateData.resolved_at = new Date().toISOString();
  } else if (status === "Closed") {
    updateData.closed_at = new Date().toISOString();
  }

  // Add updated_at
  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("complaints")
    .update(updateData)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update status: ${error.message}`);
  }

  // Handle WhatsApp Notification asynchronously
  triggerWhatsAppNotification(data, userContext).catch((err) => {
    logger.error("Failed to trigger WhatsApp notification", {
      module: "COMPLAINTS_SERVICE",
      error: err.message,
      ticket_no: data.ticket_no,
    });
  });

  return data;
};

/**
 * Helper to trigger WhatsApp notification for a complaint status update
 */
async function triggerWhatsAppNotification(complaint, userContext) {
  try {
    // 1. Get WhatsApp group mapping for the site
    const mapping = await whatsappGroupService.getMappingBySiteId(
      complaint.site_id,
    );
    if (!mapping || !mapping.is_active) {
      logger.info("No active WhatsApp mapping found for site", {
        site_id: complaint.site_id,
      });
      return;
    }

    // 2. Get Site details to get the name
    const site = await sitesService.getSiteById(complaint.site_id);
    const siteName = site?.name || complaint.site_id;

    // 3. Get Template
    const template = await whatsappTemplateService.getTemplateByKey(
      "ticket_status_update",
    );
    if (!template || !template.is_active) {
      logger.warn("WhatsApp status update template not found or inactive");
      return;
    }

    // 4. Parse Template
    const content = whapiService.parseTemplate(template.template_content, {
      ticket_no: complaint.ticket_no,
      title: complaint.title,
      status: complaint.status,
      site_name: siteName,
      updated_by: userContext.name || userContext.email || "System",
      timestamp: new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
      }),
    });

    // 5. Send Message
    await whapiService.sendGroupMessage(mapping.whatsapp_group_id, content, {
      ticket_id: complaint.ticket_id,
      ticket_no: complaint.ticket_no,
      site_id: complaint.site_id,
      sent_by: userContext.email || "system",
    });
  } catch (error) {
    logger.error("Error in triggerWhatsAppNotification", {
      module: "COMPLAINTS_SERVICE",
      error: error.message,
    });
  }
}

// DELETE - Delete complaint
export const deleteComplaint = async (ticketId) => {
  const { error } = await supabase
    .from("complaints")
    .delete()
    .eq("ticket_id", ticketId);

  if (error) {
    throw new Error(`Failed to delete complaint: ${error.message}`);
  }

  return true;
};

// STATS - Get complaint statistics by site
export const getComplaintStats = async (siteId) => {
  // Resolve numeric siteId to site_code if necessary
  let targetSiteId = siteId;
  if (!isNaN(parseInt(siteId)) && siteId.length < 10) {
    const { data: site } = await supabase
      .from("sites")
      .select("site_code")
      .eq("site_id", siteId)
      .single();
    if (site?.site_code) {
      targetSiteId = site.site_code;
    }
  }

  let query = supabase.from("complaints").select("status, category");

  if (targetSiteId !== "all") {
    query = query.eq("site_id", targetSiteId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get stats: ${error.message}`);
  }

  const stats = {
    total: data.length,
    byStatus: {},
    byCategory: {},
  };

  data.forEach((complaint) => {
    // Count by status
    stats.byStatus[complaint.status] =
      (stats.byStatus[complaint.status] || 0) + 1;
    // Count by category
    stats.byCategory[complaint.category] =
      (stats.byCategory[complaint.category] || 0) + 1;
  });

  return stats;
};

export default {
  createComplaint,
  getComplaintById,
  getComplaintsBySite,
  getComplaintByMessageId,
  getRecentComplaintsByGroup,
  updateComplaint,
  updateComplaintStatus,
  deleteComplaint,
  getComplaintStats,
};
