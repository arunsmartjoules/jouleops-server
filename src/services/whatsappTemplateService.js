import supabase from "../config/supabase.js";

export const getTemplates = async () => {
  const { data, error } = await supabase
    .from("whatsapp_message_templates")
    .select("*")
    .order("template_key", { ascending: true });

  if (error)
    throw new Error(`Failed to get WhatsApp templates: ${error.message}`);
  return data;
};

export const getTemplateByKey = async (key) => {
  const { data, error } = await supabase
    .from("whatsapp_message_templates")
    .select("*")
    .eq("template_key", key)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get template with key ${key}: ${error.message}`);
  }
  return data;
};

export const createTemplate = async (data) => {
  const { data: result, error } = await supabase
    .from("whatsapp_message_templates")
    .insert([data])
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create WhatsApp template: ${error.message}`);
  return result;
};

export const updateTemplate = async (id, data) => {
  const { data: result, error } = await supabase
    .from("whatsapp_message_templates")
    .update(data)
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to update WhatsApp template: ${error.message}`);
  return result;
};

export default {
  getTemplates,
  getTemplateByKey,
  createTemplate,
  updateTemplate,
};
