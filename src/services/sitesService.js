import supabase from "../config/supabase.js";
import { formatSiteForInsert } from "../models/siteModel.js";

export const createSite = async (data) => {
  const formattedData = formatSiteForInsert(data);

  const { data: result, error } = await supabase
    .from("sites")
    .insert(formattedData)
    .select()
    .single();

  if (error) throw new Error(`Failed to create site: ${error.message}`);
  return result;
};

export const getSiteById = async (siteId) => {
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("site_id", siteId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get site: ${error.message}`);
  }
  return data;
};

export const getAllSites = async (options = {}) => {
  const { is_active = null, city = null, search = "" } = options;

  let query = supabase.from("sites").select("*");

  if (is_active !== null) {
    query = query.eq("is_active", is_active);
  }

  if (city) {
    query = query.ilike("city", `%${city}%`);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%`);
  }

  query = query.order("name", { ascending: true });

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get sites: ${error.message}`);
  return data;
};

export const updateSite = async (siteId, updateData) => {
  const { site_id, created_at, ...allowedUpdates } = updateData;

  const { data, error } = await supabase
    .from("sites")
    .update(allowedUpdates)
    .eq("site_id", siteId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update site: ${error.message}`);
  return data;
};

export const deleteSite = async (siteId) => {
  const { error } = await supabase.from("sites").delete().eq("site_id", siteId);

  if (error) throw new Error(`Failed to delete site: ${error.message}`);
  return true;
};

export const bulkUpdateSites = async (siteIds, updateData) => {
  const { site_id, created_at, ...allowedUpdates } = updateData;

  const { data, error } = await supabase
    .from("sites")
    .update(allowedUpdates)
    .in("site_id", siteIds)
    .select();

  if (error) throw new Error(`Failed to bulk update sites: ${error.message}`);
  return data;
};

export const bulkDeleteSites = async (siteIds) => {
  const { error } = await supabase
    .from("sites")
    .delete()
    .in("site_id", siteIds);

  if (error) throw new Error(`Failed to bulk delete sites: ${error.message}`);
  return true;
};

export default {
  createSite,
  getSiteById,
  getAllSites,
  updateSite,
  deleteSite,
  bulkUpdateSites,
  bulkDeleteSites,
};
