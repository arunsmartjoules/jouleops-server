import supabase from "../config/supabase.js";
import { formatChillerReadingForInsert } from "../models/chillerReadingModel.js";

export const createChillerReading = async (data) => {
  const formattedData = formatChillerReadingForInsert(data);

  const { data: result, error } = await supabase
    .from("chiller_readings")
    .insert(formattedData)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to create chiller reading: ${error.message}`);
  return result;
};

export const getChillerReadingById = async (id) => {
  const { data, error } = await supabase
    .from("chiller_readings")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get chiller reading: ${error.message}`);
  }
  return data;
};

export const getChillerReadingsBySite = async (siteId, options = {}) => {
  const {
    page = 1,
    limit = 20,
    chiller_id = null,
    date_from = null,
    date_to = null,
    sortBy = "reading_time",
    sortOrder = "desc",
  } = options;

  const offset = (page - 1) * limit;

  let query = supabase.from("chiller_readings").select("*", { count: "exact" });

  if (siteId !== "all") {
    query = query.eq("site_id", siteId);
  }

  if (chiller_id) {
    query = query.eq("chiller_id", chiller_id);
  }

  if (date_from) {
    query = query.gte("reading_time", date_from);
  }

  if (date_to) {
    query = query.lte("reading_time", date_to);
  }

  query = query
    .order(sortBy, { ascending: sortOrder === "asc" })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error)
    throw new Error(`Failed to get chiller readings: ${error.message}`);

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

export const getChillerReadingsByChiller = async (chillerId, options = {}) => {
  const { limit = 50, date_from = null, date_to = null } = options;

  let query = supabase
    .from("chiller_readings")
    .select("*")
    .eq("chiller_id", chillerId);

  if (date_from) {
    query = query.gte("reading_time", date_from);
  }

  if (date_to) {
    query = query.lte("reading_time", date_to);
  }

  query = query.order("reading_time", { ascending: false }).limit(limit);

  const { data, error } = await query;

  if (error)
    throw new Error(`Failed to get chiller readings: ${error.message}`);
  return data;
};

export const getLatestReadingByChiller = async (chillerId) => {
  const { data, error } = await supabase
    .from("chiller_readings")
    .select("*")
    .eq("chiller_id", chillerId)
    .order("reading_time", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to get latest reading: ${error.message}`);
  }
  return data;
};

export const getReadingsByDateShift = async (siteId, dateShift) => {
  const { data, error } = await supabase
    .from("chiller_readings")
    .select("*")
    .eq("site_id", siteId)
    .eq("date_shift", dateShift)
    .order("reading_time", { ascending: true });

  if (error) throw new Error(`Failed to get readings: ${error.message}`);
  return data;
};

export const updateChillerReading = async (id, updateData) => {
  const { created_at, ...allowedUpdates } = updateData;

  const { data, error } = await supabase
    .from("chiller_readings")
    .update(allowedUpdates)
    .eq("id", id)
    .select()
    .single();

  if (error)
    throw new Error(`Failed to update chiller reading: ${error.message}`);
  return data;
};

export const deleteChillerReading = async (id) => {
  const { error } = await supabase
    .from("chiller_readings")
    .delete()
    .eq("id", id);

  if (error)
    throw new Error(`Failed to delete chiller reading: ${error.message}`);
  return true;
};

// Get average readings for a chiller over a period
export const getChillerAverages = async (chillerId, dateFrom, dateTo) => {
  const { data, error } = await supabase
    .from("chiller_readings")
    .select("*")
    .eq("chiller_id", chillerId)
    .gte("reading_time", dateFrom)
    .lte("reading_time", dateTo);

  if (error) throw new Error(`Failed to get readings: ${error.message}`);

  if (data.length === 0) return null;

  const averages = {
    count: data.length,
    condenser_inlet_temp: 0,
    condenser_outlet_temp: 0,
    evaporator_inlet_temp: 0,
    evaporator_outlet_temp: 0,
    compressor_load_percent: 0,
  };

  data.forEach((reading) => {
    averages.condenser_inlet_temp += reading.condenser_inlet_temp || 0;
    averages.condenser_outlet_temp += reading.condenser_outlet_temp || 0;
    averages.evaporator_inlet_temp += reading.evaporator_inlet_temp || 0;
    averages.evaporator_outlet_temp += reading.evaporator_outlet_temp || 0;
    averages.compressor_load_percent += reading.compressor_load_percent || 0;
  });

  Object.keys(averages).forEach((key) => {
    if (key !== "count") {
      averages[key] = (averages[key] / data.length).toFixed(2);
    }
  });

  return averages;
};

export default {
  createChillerReading,
  getChillerReadingById,
  getChillerReadingsBySite,
  getChillerReadingsByChiller,
  getLatestReadingByChiller,
  getReadingsByDateShift,
  updateChillerReading,
  deleteChillerReading,
  getChillerAverages,
};
