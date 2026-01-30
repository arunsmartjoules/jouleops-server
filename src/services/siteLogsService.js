import supabase from "../config/supabase.js";
import { formatSiteLogForInsert } from "../models/siteLogModel.js";

export const createLog = async (data) => {
  const formattedData = formatSiteLogForInsert(data);
  const { data: result, error } = await supabase
    .from("site_logs")
    .insert(formattedData)
    .select()
    .single();

  if (error) throw new Error(`Failed to create site log: ${error.message}`);
  return result;
};

export const getLogsBySite = async (siteId, options = {}) => {
  const { page = 1, limit = 20, log_name = null } = options;
  const offset = (page - 1) * limit;

  let targetSiteId = siteId;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (siteId !== "all" && uuidRegex.test(siteId)) {
    const { data: site } = await supabase
      .from("sites")
      .select("site_code")
      .eq("id", siteId)
      .single();

    if (site?.site_code) {
      targetSiteId = site.site_code;
    }
  }

  let query = supabase.from("site_logs").select("*", { count: "exact" });

  if (targetSiteId !== "all") {
    query = query.eq("site_id", targetSiteId);
  }

  if (log_name) {
    query = query.eq("log_name", log_name);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(`Failed to get site logs: ${error.message}`);

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

export const updateLog = async (id, data) => {
  // Remove immutable fields
  const { id: logId, created_at, user_id, ...updates } = data;

  const { data: result, error } = await supabase
    .from("site_logs")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update site log: ${error.message}`);
  return result;
};

export const deleteLog = async (id) => {
  const { error } = await supabase.from("site_logs").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete site log: ${error.message}`);
  return true;
};

export const deleteLogs = async (ids) => {
  if (!ids || ids.length === 0) return { count: 0 };

  const { error, count } = await supabase
    .from("site_logs")
    .delete({ count: "exact" })
    .in("id", ids);

  if (error) throw new Error(`Failed to delete site logs: ${error.message}`);
  return { count };
};

export default { createLog, getLogsBySite, updateLog, deleteLog, deleteLogs };
