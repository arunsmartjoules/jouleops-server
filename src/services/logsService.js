import supabase from "../config/supabase.js";

/**
 * Log an activity to app_logs table
 */
export const logActivity = async (params) => {
  const {
    user_id,
    site_id,
    action,
    module,
    description,
    ip_address,
    device_info,
    metadata,
  } = params;

  try {
    const { error } = await supabase.from("app_logs").insert({
      user_id: user_id || null,
      site_id: site_id || null,
      action,
      module,
      description: description || null,
      ip_address: ip_address || null,
      device_info: device_info || null,
      metadata: metadata || {},
    });

    if (error) {
      console.error("Failed to insert log:", error);
    }
  } catch (err) {
    console.error("Critical error in logging service:", err);
  }
};

export const getAllLogs = async (options = {}) => {
  const {
    page = 1,
    limit = 50,
    module = null,
    action = null,
    search = "",
  } = options;
  const offset = (page - 1) * limit;

  let query = supabase.from("app_logs").select("*", { count: "exact" });

  if (module) query = query.eq("module", module);
  if (action) query = query.eq("action", action);
  if (search) query = query.ilike("description", `%${search}%`);
  if (options.from) query = query.gte("created_at", `${options.from}T00:00:00`);
  if (options.to) query = query.lte("created_at", `${options.to}T23:59:59`);

  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: logs, error, count } = await query;

  if (error) throw new Error(`Failed to get logs: ${error.message}`);

  // Fetch user emails manually since there's no FK defined
  const userIds = [
    ...new Set(logs.filter((l) => l.user_id).map((l) => l.user_id)),
  ];

  let logsWithUsers = logs;
  if (userIds.length > 0) {
    const { data: users, error: userError } = await supabase
      .from("users")
      .select("user_id, email")
      .in("user_id", userIds);

    if (!userError && users) {
      const userMap = users.reduce((acc, user) => {
        acc[user.user_id] = user.email;
        return acc;
      }, {});

      logsWithUsers = logs.map((log) => ({
        ...log,
        users: { email: userMap[log.user_id] || "N/A" },
      }));
    } else {
      // If no users found but we have logs, ensure users object exists
      logsWithUsers = logs.map((log) => ({
        ...log,
        users: { email: "N/A" },
      }));
    }
  } else {
    // No user_ids at all, but we should still have the property for the frontend
    logsWithUsers = logs.map((log) => ({
      ...log,
      users: { email: "SYSTEM" },
    }));
  }

  return {
    data: logsWithUsers,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

/**
 * Get aggregated error counts for the last X days
 */
export const getErrorTrends = async (days = 7) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  startDate.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("app_logs")
    .select("created_at")
    .ilike("action", "%ERROR%")
    .gte("created_at", startDate.toISOString());

  if (error) throw new Error(`Failed to fetch error trends: ${error.message}`);

  // Initialize days
  const trends = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    trends.push({
      date: d.toISOString().split("T")[0],
      errors: 0,
    });
  }

  // Count errors per day
  data.forEach((log) => {
    const dateStr = log.created_at.split("T")[0];
    const trendItem = trends.find((t) => t.date === dateStr);
    if (trendItem) {
      trendItem.errors++;
    }
  });

  return trends;
};

export default {
  logActivity,
  getAllLogs,
  getErrorTrends,
};
