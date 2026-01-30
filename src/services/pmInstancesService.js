import supabase from "../config/supabase.js";
import { formatPMInstanceForInsert } from "../models/pmInstanceModel.js";

export const createPMInstance = async (data) => {
  // Check if site_id is provided
  if (data.site_id) {
    // Simple UUID validation regex
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(data.site_id)) {
      // It's not a UUID, assume it's a site_code and look it up
      const { data: siteData, error: siteError } = await supabase
        .from("sites")
        .select("site_id")
        .eq("site_code", data.site_id)
        .single();

      if (siteError || !siteData) {
        throw new Error(
          `Site not found for code: ${data.site_id}. Please ensure the site code is correct.`,
        );
      }

      // Replace site_code with the actual UUID
      data.site_id = siteData.site_id;
    }
  }

  const formattedData = formatPMInstanceForInsert(data);

  const { data: result, error } = await supabase
    .from("pm_instances")
    .insert(formattedData)
    .select()
    .single();

  if (error) throw new Error(`Failed to create PM instance: ${error.message}`);
  return result;
};

export const getPMInstanceById = async (instanceId) => {
  const { data, error } = await supabase
    .from("pm_instances")
    .select("*")
    .eq("instance_id", instanceId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get PM instance: ${error.message}`);
  }
  return data;
};

export const getPMInstancesBySite = async (siteId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    status = null,
    frequency = null,
    asset_type = null,
    sortBy = "start_due_date",
    sortOrder = "asc",
  } = options;

  const offset = (page - 1) * limit;

  let query = supabase
    .from("pm_instances")
    .select("*", { count: "exact" })
    .eq("site_id", siteId);

  if (status) {
    query = query.eq("status", status);
  }

  if (frequency) {
    query = query.eq("frequency", frequency);
  }

  if (asset_type) {
    query = query.eq("asset_type", asset_type);
  }

  query = query
    .order(sortBy, { ascending: sortOrder === "asc" })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to get PM instances: ${error.message}`);

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

export const getPMInstancesByAsset = async (assetId) => {
  const { data, error } = await supabase
    .from("pm_instances")
    .select("*")
    .eq("asset_id", assetId)
    .order("start_due_date", { ascending: false });

  if (error) throw new Error(`Failed to get PM instances: ${error.message}`);
  return data;
};

export const getPendingPMInstances = async (siteId, days = 7) => {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + days);

  const { data, error } = await supabase
    .from("pm_instances")
    .select("*")
    .eq("site_id", siteId)
    .eq("status", "Pending")
    .lte("start_due_date", futureDate.toISOString().split("T")[0])
    .order("start_due_date", { ascending: true });

  if (error) throw new Error(`Failed to get PM instances: ${error.message}`);
  return data;
};

export const getOverduePMInstances = async (siteId) => {
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("pm_instances")
    .select("*")
    .eq("site_id", siteId)
    .in("status", ["Pending", "In Progress"])
    .lt("start_due_date", today)
    .order("start_due_date", { ascending: true });

  if (error) throw new Error(`Failed to get PM instances: ${error.message}`);
  return data;
};

export const updatePMInstance = async (instanceId, updateData) => {
  const { instance_id, created_at, ...allowedUpdates } = updateData;

  const { data, error } = await supabase
    .from("pm_instances")
    .update(allowedUpdates)
    .eq("instance_id", instanceId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update PM instance: ${error.message}`);
  return data;
};

export const updatePMInstanceStatus = async (
  instanceId,
  status,
  userId = null,
) => {
  const updateData = {
    status,
    updated_by: userId,
  };

  if (status === "In Progress") {
    updateData.start_datetime = new Date().toISOString();
  } else if (status === "Completed") {
    updateData.end_datetime = new Date().toISOString();
    updateData.progress = 100;
  }

  const { data, error } = await supabase
    .from("pm_instances")
    .update(updateData)
    .eq("instance_id", instanceId)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to update PM instance status: ${error.message}`);
  return data;
};

export const updatePMInstanceProgress = async (instanceId, progress) => {
  const { data, error } = await supabase
    .from("pm_instances")
    .update({ progress })
    .eq("instance_id", instanceId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update progress: ${error.message}`);
  return data;
};

export const deletePMInstance = async (instanceId) => {
  const { error } = await supabase
    .from("pm_instances")
    .delete()
    .eq("instance_id", instanceId);

  if (error) throw new Error(`Failed to delete PM instance: ${error.message}`);
  return true;
};

export const getPMStats = async (siteId) => {
  const { data, error } = await supabase
    .from("pm_instances")
    .select("status, frequency")
    .eq("site_id", siteId);

  if (error) throw new Error(`Failed to get stats: ${error.message}`);

  const stats = {
    total: data.length,
    byStatus: {},
    byFrequency: {},
  };

  data.forEach((pm) => {
    stats.byStatus[pm.status] = (stats.byStatus[pm.status] || 0) + 1;
    if (pm.frequency) {
      stats.byFrequency[pm.frequency] =
        (stats.byFrequency[pm.frequency] || 0) + 1;
    }
  });

  return stats;
};

export default {
  createPMInstance,
  getPMInstanceById,
  getPMInstancesBySite,
  getPMInstancesByAsset,
  getPendingPMInstances,
  getOverduePMInstances,
  updatePMInstance,
  updatePMInstanceStatus,
  updatePMInstanceProgress,
  deletePMInstance,
  getPMStats,
};
