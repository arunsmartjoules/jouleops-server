import supabase from "../config/supabase.js";
import {
  getUserTokens,
  getUsersTokens,
  getAllActiveTokens,
} from "./pushTokenService.js";

/**
 * Send push notification using Expo Push Notification API
 * @param {Array} tokens - Array of Expo push tokens
 * @param {String} title - Notification title
 * @param {String} body - Notification body
 * @param {Object} data - Additional data to send with notification
 */
export const sendPushNotification = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) {
    console.log("No tokens provided for push notification");
    return { success: false, error: "No tokens provided" };
  }

  // Filter valid Expo push tokens
  const validTokens = tokens.filter(
    (token) =>
      token.startsWith("ExponentPushToken[") ||
      token.startsWith("ExpoPushToken["),
  );

  if (validTokens.length === 0) {
    console.log("No valid Expo push tokens found");
    return { success: false, error: "No valid tokens" };
  }

  const BATCH_SIZE = 100;
  const chunks = [];
  for (let i = 0; i < validTokens.length; i += BATCH_SIZE) {
    chunks.push(validTokens.slice(i, i + BATCH_SIZE));
  }

  const batchResults = [];
  let totalSuccess = 0;

  for (const chunk of chunks) {
    const messages = chunk.map((token) => ({
      to: token,
      sound: "default",
      title: title,
      body: body,
      data: data,
      priority: "high",
      channelId: "default",
    }));

    try {
      // Send to Expo Push Notification API
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Push notification batch error:", result);
        batchResults.push({ success: false, error: result, tokens: chunk });
        continue;
      }

      // Check for errors in individual ticket responses
      // Note: Expo returns an array of results matching the order of tokens
      if (result.data && Array.isArray(result.data)) {
        result.data.forEach((item, index) => {
          if (item.status === "ok") {
            totalSuccess++;
          } else if (
            item.details &&
            item.details.error === "DeviceNotRegistered"
          ) {
            // Token is no longer valid, we should cleanup this token
            const invalidToken = chunk[index];
            console.log(`Cleaning up invalid token: ${invalidToken}`);
            // We'll let the pushTokenService handle this if imported,
            // but for now we'll just log it.
            // Ideally we'd call pushTokenService.removeToken(invalidToken)
          }
        });
      }

      batchResults.push({
        success: true,
        data: result,
        tokensCount: chunk.length,
      });
    } catch (error) {
      console.error("Failed to send push notification batch:", error);
      batchResults.push({
        success: false,
        error: error.message,
        tokens: chunk,
      });
    }
  }

  const allSuccess = batchResults.every((r) => r.success);
  console.log(
    `Push notification summary: ${totalSuccess}/${validTokens.length} successful`,
  );

  return {
    success: allSuccess,
    totalSent: validTokens.length,
    totalSuccess,
    batchResults,
  };
};

/**
 * Send push notification to a specific user
 */
export const sendNotificationToUser = async (
  userId,
  title,
  body,
  data = {},
) => {
  const tokenRecords = await getUserTokens(userId);

  if (!tokenRecords || tokenRecords.length === 0) {
    return { success: false, error: "No tokens found for user" };
  }

  const tokens = tokenRecords.map((record) => record.push_token);
  const result = await sendPushNotification(tokens, title, body, data);

  // Log the notification
  if (result.success) {
    await logNotification(userId, title, body, data.type || "custom", "sent");
  } else {
    const errorMessage =
      typeof result.error === "object"
        ? JSON.stringify(result.error)
        : result.error;
    await logNotification(
      userId,
      title,
      body,
      data.type || "custom",
      "failed",
      errorMessage,
    );
  }

  return result;
};

/**
 * Send push notification to multiple users
 */
export const sendNotificationToUsers = async (
  userIds,
  title,
  body,
  data = {},
) => {
  const tokenRecords = await getUsersTokens(userIds);

  if (!tokenRecords || tokenRecords.length === 0) {
    return { success: false, error: "No tokens found for users" };
  }

  const tokens = tokenRecords.map((record) => record.push_token);
  const result = await sendPushNotification(tokens, title, body, data);

  // Log the notification for each user
  for (const userId of userIds) {
    if (result.success) {
      await logNotification(userId, title, body, data.type || "custom", "sent");
    } else {
      const errorMessage =
        typeof result.error === "object"
          ? JSON.stringify(result.error)
          : result.error;
      await logNotification(
        userId,
        title,
        body,
        data.type || "custom",
        "failed",
        errorMessage,
      );
    }
  }

  return result;
};

/**
 * Send push notification to all users
 */
export const sendNotificationToAll = async (title, body, data = {}) => {
  const tokenRecords = await getAllActiveTokens();

  if (!tokenRecords || tokenRecords.length === 0) {
    return { success: false, error: "No tokens found" };
  }

  const tokens = tokenRecords.map((record) => record.push_token);
  const result = await sendPushNotification(tokens, title, body, data);

  // Log the notification for each user
  for (const record of tokenRecords) {
    if (result.success) {
      await logNotification(
        record.user_id,
        title,
        body,
        data.type || "custom",
        "sent",
      );
    } else {
      const errorMessage =
        typeof result.error === "object"
          ? JSON.stringify(result.error)
          : result.error;
      await logNotification(
        record.user_id,
        title,
        body,
        data.type || "custom",
        "failed",
        errorMessage,
      );
    }
  }

  return result;
};

/**
 * Log a sent notification
 */
export const logNotification = async (
  userId,
  title,
  body,
  notificationType,
  status = "sent",
  errorMessage = null,
) => {
  try {
    const { error } = await supabase.from("notification_logs").insert({
      user_id: userId,
      title: title,
      body: body,
      notification_type: notificationType,
      status: status,
      error_message: errorMessage,
      sent_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Failed to log notification:", error);
    }
  } catch (err) {
    console.error("Error logging notification:", err);
  }
};

/**
 * Get notification logs with pagination
 */
export const getNotificationLogs = async (options = {}) => {
  const { page = 1, limit = 50, userId = null, type = null } = options;
  const offset = (page - 1) * limit;

  let query = supabase
    .from("notification_logs")
    .select("*, users(name, employee_code)", { count: "exact" });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (type) {
    query = query.eq("notification_type", type);
  }

  query = query
    .order("sent_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error)
    throw new Error(`Failed to get notification logs: ${error.message}`);

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

export default {
  sendPushNotification,
  sendNotificationToUser,
  sendNotificationToUsers,
  sendNotificationToAll,
  logNotification,
  getNotificationLogs,
};
