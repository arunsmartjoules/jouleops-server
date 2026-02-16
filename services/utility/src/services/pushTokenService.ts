import { query, queryOne } from "@jouleops/shared";

/**
 * Register or update a push token for a user's device
 */
export const registerPushToken = async (
  userId,
  pushToken,
  deviceId,
  platform,
) => {
  // Check if exists
  const existing = await queryOne(
    "SELECT * FROM push_tokens WHERE push_token = $1",
    [pushToken],
  );

  if (existing) {
    // Update existing token
    return await queryOne(
      `
          UPDATE push_tokens
          SET user_id = $1, device_id = $2, platform = $3, enabled = true, updated_at = NOW()
          WHERE push_token = $4
          RETURNING *
      `,
      [userId, deviceId, platform, pushToken],
    );
  } else {
    // Insert new token
    return await queryOne(
      `
          INSERT INTO push_tokens (user_id, push_token, device_id, platform, enabled)
          VALUES ($1, $2, $3, $4, true)
          RETURNING *
      `,
      [userId, pushToken, deviceId, platform],
    );
  }
};

/**
 * Get all active push tokens for a specific user
 */
export const getUserTokens = async (userId) => {
  return await query(
    "SELECT * FROM push_tokens WHERE user_id = $1 AND enabled = true",
    [userId],
  );
};

/**
 * Get all active push tokens (for broadcasting)
 */
export const getAllActiveTokens = async () => {
  return await query(
    "SELECT push_token, user_id FROM push_tokens WHERE enabled = true",
  );
};

/**
 * Remove a push token (e.g., on logout or when invalid)
 */
export const removeToken = async (pushToken) => {
  await query("DELETE FROM push_tokens WHERE push_token = $1", [pushToken]);
  return true;
};

/**
 * Disable a push token (soft delete)
 */
export const disableToken = async (pushToken) => {
  await query(
    "UPDATE push_tokens SET enabled = false, updated_at = NOW() WHERE push_token = $1",
    [pushToken],
  );
  return true;
};

/**
 * Get tokens for multiple users
 */
export const getUsersTokens = async (userIds) => {
  if (!userIds || userIds.length === 0) return [];
  return await query(
    "SELECT push_token, user_id FROM push_tokens WHERE user_id = ANY($1) AND enabled = true",
    [userIds],
  );
};

export default {
  registerPushToken,
  getUserTokens,
  getAllActiveTokens,
  removeToken,
  disableToken,
  getUsersTokens,
};
