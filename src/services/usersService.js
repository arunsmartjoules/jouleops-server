import supabase from "../config/supabase.js";
import { formatUserForInsert } from "../models/userModel.js";

export const createUser = async (data) => {
  const formattedData = formatUserForInsert(data);

  const { data: result, error } = await supabase
    .from("users")
    .insert(formattedData)
    .select()
    .single();

  if (error) throw new Error(`Failed to create user: ${error.message}`);
  return result;
};

export const getUserById = async (userId) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get user: ${error.message}`);
  }
  return data;
};

export const getUserByPhone = async (phone) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get user: ${error.message}`);
  }
  return data;
};

export const getUserByEmail = async (email) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get user: ${error.message}`);
  }
  return data;
};

export const getUsersBySite = async (siteId, options = {}) => {
  const { role = null, is_active = true } = options;

  let query = supabase.from("users").select("*").eq("site_id", siteId);

  if (role) {
    query = query.eq("role", role);
  }

  if (is_active !== null) {
    query = query.eq("is_active", is_active);
  }

  query = query.order("name", { ascending: true });

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get users: ${error.message}`);
  return data;
};

export const getAllUsers = async (options = {}) => {
  const {
    page = 1,
    limit = 50,
    role = null,
    is_active = null,
    search = "",
  } = options;
  const offset = (page - 1) * limit;

  let query = supabase.from("users").select("*", { count: "exact" });

  if (role) {
    query = query.eq("role", role);
  }

  if (is_active !== null) {
    query = query.eq("is_active", is_active);
  }

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,employee_code.ilike.%${search}%`,
    );
  }

  query = query
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to get users: ${error.message}`);

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

export const updateUser = async (userId, updateData) => {
  const { user_id, created_at, ...allowedUpdates } = updateData;

  const { data, error } = await supabase
    .from("users")
    .update(allowedUpdates)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update user: ${error.message}`);
  return data;
};

export const deleteUser = async (userId) => {
  const { error } = await supabase.from("users").delete().eq("user_id", userId);

  if (error) throw new Error(`Failed to delete user: ${error.message}`);
  return true;
};

export const bulkUpdateUsers = async (userIds, updateData) => {
  const { user_id, created_at, ...allowedUpdates } = updateData;

  const { data, error } = await supabase
    .from("users")
    .update(allowedUpdates)
    .in("user_id", userIds)
    .select();

  if (error) throw new Error(`Failed to bulk update users: ${error.message}`);
  return data;
};

export const bulkDeleteUsers = async (userIds) => {
  const { error } = await supabase
    .from("users")
    .delete()
    .in("user_id", userIds);

  if (error) throw new Error(`Failed to bulk delete users: ${error.message}`);
  return true;
};

export default {
  createUser,
  getUserById,
  getUserByPhone,
  getUserByEmail,
  getUsersBySite,
  getAllUsers,
  updateUser,
  deleteUser,
  bulkUpdateUsers,
  bulkDeleteUsers,
};
