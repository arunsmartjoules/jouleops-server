/**
 * Auth Repository
 *
 * Data access layer for refresh_tokens and api_keys tables.
 */

import { query, queryOne, redis } from "@jouleops/shared";
import crypto from "crypto";

// Track Redis availability
let redisAvailable = true;

/**
 * Check if Redis is available
 */
async function isRedisAvailable(): Promise<boolean> {
  try {
    await redis.ping();
    redisAvailable = true;
    return true;
  } catch {
    redisAvailable = false;
    return false;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface RefreshToken {
  id?: number;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked: boolean;
  device_info?: string;
  created_at?: Date;
}

export interface ApiKey {
  id: number;
  key_hash: string;
  name: string;
  scopes?: string[];
  last_used_at?: Date;
  created_at: Date;
}

// Token blacklist TTL (60 days in seconds)
const TOKEN_BLACKLIST_TTL = 60 * 24 * 60 * 60;
const REFRESH_TOKEN_TTL = 60 * 24 * 60 * 60; // 60 days

// ============================================================================
// Refresh Token Functions (Redis-based)
// ============================================================================

/**
 * Store a refresh token in Redis
 * Gracefully handles Redis being unavailable - login will still work,
 * but token refresh won't work until Redis is available.
 */
export async function storeRefreshToken(data: {
  user_id: string;
  token: string;
  expires_at: Date;
  device_info?: string;
}): Promise<void> {
  try {
    const tokenHash = crypto
      .createHash("sha256")
      .update(data.token)
      .digest("hex");

    const redisKey = `rt:${tokenHash}`;
    const userKey = `user_rt:${data.user_id}`;

    const tokenData = {
      user_id: data.user_id,
      device_info: data.device_info,
      created_at: new Date().toISOString(),
    };

    // Store token data
    await redis.setex(redisKey, REFRESH_TOKEN_TTL, JSON.stringify(tokenData));

    // Add to user's token set
    await redis.sadd(userKey, tokenHash);
    // Set expiry on the set as well (doesn't have to be exact, just to avoid garbage)
    await redis.expire(userKey, REFRESH_TOKEN_TTL);
  } catch (error: any) {
    // Log but don't throw - allow login to succeed without Redis
    console.warn("Redis unavailable for storing refresh token:", error.message);
  }
}

/**
 * Get a valid refresh token by hash from Redis
 */
export async function getRefreshToken(
  token: string,
  userId: string,
): Promise<RefreshToken | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const redisKey = `rt:${tokenHash}`;

  const data = await redis.get(redisKey);

  if (!data) return null;

  try {
    const parsed = JSON.parse(data);

    // Validate ownership
    if (parsed.user_id !== userId) return null;

    return {
      user_id: parsed.user_id,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000), // Approximate
      revoked: false,
      device_info: parsed.device_info,
      created_at: new Date(parsed.created_at),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(token: string): Promise<boolean> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const redisKey = `rt:${tokenHash}`;

  const data = await redis.get(redisKey);
  if (data) {
    try {
      const parsed = JSON.parse(data);
      const userKey = `user_rt:${parsed.user_id}`;

      // Remove from user set
      await redis.srem(userKey, tokenHash);
    } catch (e) {
      // Ignore parse error
    }
  }

  // Delete token
  const result = await redis.del(redisKey);
  return result > 0;
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const userKey = `user_rt:${userId}`;
  const tokens = await redis.smembers(userKey);

  if (tokens.length > 0) {
    // Delete all individual tokens
    const keys = tokens.map((hash) => `rt:${hash}`);
    await redis.del(...keys);
  }

  // Delete the set
  await redis.del(userKey);
}

/**
 * Cleanup expired refresh tokens
 * (Redis handles this automatically, so this is just a stub for compatibility)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  // Redis handles expiration automatically (setex)
  return 0;
}

// ============================================================================
// Token Blacklist (Redis-based for fast lookup)
// ============================================================================

/**
 * Add a JWT to the blacklist (for logout before expiry)
 */
export async function blacklistToken(
  jti: string,
  expiresIn: number,
): Promise<void> {
  try {
    const key = `blacklist:${jti}`;
    // Only blacklist if expiresIn is positive
    if (expiresIn > 0) {
      await redis.setex(key, expiresIn, "1");
    }
  } catch (error: any) {
    // Log but don't throw - blacklisting is best-effort without Redis
    console.warn("Redis unavailable for token blacklisting:", error.message);
  }
}

/**
 * Check if a JWT is blacklisted
 * Returns false if Redis is unavailable (tokens are assumed valid)
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  if (!jti) return false;
  try {
    const key = `blacklist:${jti}`;
    const result = await redis.get(key);
    return result !== null;
  } catch (error: any) {
    // If Redis is down, assume token is not blacklisted
    console.warn("Redis unavailable for blacklist check:", error.message);
    return false;
  }
}

// ============================================================================
// API Key Functions
// ============================================================================

/**
 * Validate an API key
 */
export async function validateApiKey(apiKey: string): Promise<ApiKey | null> {
  const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

  const key = await queryOne<ApiKey>(
    `SELECT * FROM api_keys WHERE key_hash = $1`,
    [keyHash],
  );

  if (key) {
    // Update last used (fire and forget)
    query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [
      key.id,
    ]).catch(() => {}); // Ignore errors for this non-critical update
  }

  return key;
}

export default {
  storeRefreshToken,
  getRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
  blacklistToken,
  isTokenBlacklisted,
  validateApiKey,
};
