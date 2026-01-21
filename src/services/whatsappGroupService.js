import supabase from "../config/supabase.js";

export const getMappings = async () => {
  const { data, error } = await supabase
    .from("whatsapp_group_mappings")
    .select("*")
    .order("site_name", { ascending: true });

  if (error)
    throw new Error(`Failed to get WhatsApp mappings: ${error.message}`);
  return data;
};

export const getMappingBySiteId = async (siteId) => {
  const { data, error } = await supabase
    .from("whatsapp_group_mappings")
    .select("*")
    .eq("site_id", siteId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(
      `Failed to get mapping for site ${siteId}: ${error.message}`,
    );
  }
  return data;
};

export const createMapping = async (data) => {
  const { data: result, error } = await supabase
    .from("whatsapp_group_mappings")
    .insert([data])
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create WhatsApp mapping: ${error.message}`);
  return result;
};

export const updateMapping = async (id, data) => {
  const { data: result, error } = await supabase
    .from("whatsapp_group_mappings")
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to update WhatsApp mapping: ${error.message}`);
  return result;
};

export const deleteMapping = async (id) => {
  const { error } = await supabase
    .from("whatsapp_group_mappings")
    .delete()
    .eq("id", id);

  if (error)
    throw new Error(`Failed to delete WhatsApp mapping: ${error.message}`);
  return true;
};

export default {
  getMappings,
  getMappingBySiteId,
  createMapping,
  updateMapping,
  deleteMapping,
};
