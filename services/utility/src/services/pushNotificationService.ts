import { query, queryOne, logActivity } from "@jouleops/shared";
import {
  getUserTokens,
  getUsersTokens,
  getAllActiveTokens,
  removeToken,
} from "./pushTokenService.ts";

interface NotificationData {
  type?: string;
  [key: string]: any;
}

interface PushBatchResult {
  success: boolean;
  data?: any;
  error?: any;
  tokensCount?: number;
  tokens?: string[];
}

interface PushResponse {
  success: boolean;
  totalSent: number;
  totalSuccess: number;
  batchResults: PushBatchResult[];
  error?: string;
}

interface LogOptions {
  page?: number;
  limit?: number;
  userId?: string | null;
  type?: string | null;
}

/**
 * Send push notification using Expo Push Notification API
 */
export const sendPushNotification = async (
  tokens: string[],
  title: string,
  body: string,
  data: NotificationData = {},
): Promise<PushResponse> => {
  if (!tokens || tokens.length === 0) {
    console.log("No tokens provided for push notification");
    return {
      success: false,
      totalSent: 0,
      totalSuccess: 0,
      batchResults: [],
      error: "No tokens provided",
    };
  }

  // Filter valid Expo push tokens
  const validTokens = tokens.filter(
    (token) =>
      token?.startsWith("ExponentPushToken[") ||
      token?.startsWith("ExpoPushToken["),
  );

  if (validTokens.length === 0) {
    console.log("No valid Expo push tokens found");
    return {
      success: false,
      totalSent: 0,
      totalSuccess: 0,
      batchResults: [],
      error: "No valid tokens",
    };
  }

  const BATCH_SIZE = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < validTokens.length; i += BATCH_SIZE) {
    chunks.push(validTokens.slice(i, i + BATCH_SIZE));
  }

  const batchResults: PushBatchResult[] = [];
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

      const result = (await response.json()) as any;

      if (!response.ok) {
        console.error("Push notification batch error:", result);
        batchResults.push({ success: false, error: result, tokens: chunk });
        continue;
      }

      batchResults.push({
        success: true,
        data: result,
        tokensCount: chunk.length,
        tokens: chunk,
      });
    } catch (error: any) {
      console.error("Failed to send push notification batch:", error);
      batchResults.push({
        success: false,
        error: error.message,
        tokens: chunk,
      });
    }
  }

  // Calculate total success and handle token cleanup
  for (const batch of batchResults) {
    if (batch.success && batch.data?.data && Array.isArray(batch.data.data)) {
      batch.data.data.forEach((item: any, index: number) => {
        if (item.status === "ok") {
          totalSuccess++;
        } else if (
          item.status === "error" &&
          item.details?.error === "DeviceNotRegistered"
        ) {
          const invalidToken = batch.tokens?.[index];
          if (invalidToken) {
            console.log(`Cleaning up invalid token: ${invalidToken}`);
            removeToken(invalidToken).catch((err) =>
              console.error(
                `Failed to remove invalid token ${invalidToken}:`,
                err,
              ),
            );
          }
        }
      });
    }
  }

  const allSuccess = totalSuccess === validTokens.length;

  return {
    success: allSuccess,
    totalSent: tokens.length,
    totalSuccess,
    batchResults,
  };
};

/**
 * Send push notification to a specific user
 */
export const sendNotificationToUser = async (
  userId: string,
  title: string,
  body: string,
  data: NotificationData = {},
): Promise<PushResponse> => {
  const tokenRecords = await getUserTokens(userId);

  if (!tokenRecords || tokenRecords.length === 0) {
    return {
      success: false,
      totalSent: 0,
      totalSuccess: 0,
      batchResults: [],
      error: "No tokens found for user",
    };
  }

  const tokens = tokenRecords.map((record: any) => record.push_token);
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
  userIds: string[],
  title: string,
  body: string,
  data: NotificationData = {},
): Promise<PushResponse> => {
  const tokenRecords = await getUsersTokens(userIds);

  if (!tokenRecords || tokenRecords.length === 0) {
    return {
      success: false,
      totalSent: 0,
      totalSuccess: 0,
      batchResults: [],
      error: "No tokens found for users",
    };
  }

  const tokens = tokenRecords.map((record: any) => record.push_token);
  const result = await sendPushNotification(tokens, title, body, data);

  // Log the notification for each user
  for (const userId of userIds) {
    if (result.success) {
      await logNotification(userId, title, body, data.type || "custom", "sent");
    } else {
      const errorMessage =
        typeof (result as any).error === "object"
          ? JSON.stringify((result as any).error)
          : (result as any).error;
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
export const sendNotificationToAll = async (
  title: string,
  body: string,
  data: NotificationData = {},
): Promise<PushResponse> => {
  const tokenRecords = await getAllActiveTokens();

  if (!tokenRecords || tokenRecords.length === 0) {
    return {
      success: false,
      totalSent: 0,
      totalSuccess: 0,
      batchResults: [],
      error: "No tokens found",
    };
  }

  const tokens = tokenRecords.map((record: any) => record.push_token);
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
        typeof (result as any).error === "object"
          ? JSON.stringify((result as any).error)
          : (result as any).error;
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
  userId: string,
  title: string,
  body: string,
  notificationType: string,
  status: string = "sent",
  errorMessage: string | null = null,
): Promise<void> => {
  try {
    await query(
      `
        INSERT INTO notification_logs (user_id, title, body, notification_type, status, error_message, sent_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `,
      [userId, title, body, notificationType, status, errorMessage],
    );

    // Also log to general activity_logs
    await logActivity({
      user_id: userId,
      action:
        status === "sent"
          ? "PUSH_NOTIFICATION_SENT"
          : "PUSH_NOTIFICATION_FAILED",
      module: "notifications",
      description: `Push notification ${status}: ${title}`,
      metadata: {
        title,
        body,
        notification_type: notificationType,
        status,
        error_message: errorMessage,
      },
    });
  } catch (err) {
    console.error("Error logging notification:", err);
  }
};

/**
 * Get notification logs with pagination
 */
export const getNotificationLogs = async (options: LogOptions = {}) => {
  const { page = 1, limit = 50, userId = null, type = null } = options;
  const offset = (page - 1) * limit;

  let conditions: string[] = [];
  let params: any[] = [];

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
