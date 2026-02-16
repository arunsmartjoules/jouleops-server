import { query, queryOne } from "@jouleops/shared";
import {
  getUserTokens,
  getUsersTokens,
  getAllActiveTokens,
} from "./pushTokenService.ts";

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
    await query(
      `
        INSERT INTO notification_logs (user_id, title, body, notification_type, status, error_message, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `,
      [userId, title, body, notificationType, status, errorMessage],
    );
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

  let conditions = [];
  let params = [];

  if (userId) {
    params.push(userId);
    conditions.push(`nl.user_id = $${params.length}`);
  }

  if (type) {
    params.push(type);
    conditions.push(`nl.notification_type = $${params.length}`);
  }

  const whereClause = conditions.length
    ? "WHERE " + conditions.join(" AND ")
    : "";

  // Count exact
  const countRes = await queryOne(
    `SELECT COUNT(*) as count FROM notification_logs nl ${whereClause}`,
    params,
  );
  const count = parseInt(countRes?.count || "0");

  // Data
  params.push(limit, offset);
  const data = await query(
    `
      SELECT 
        nl.*, 
        json_build_object('name', u.name, 'employee_code', u.employee_code) as users
      FROM notification_logs nl
      LEFT JOIN users u ON nl.user_id = u.user_id
      ${whereClause}
      ORDER BY nl.sent_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
  `,
    params,
  );

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
