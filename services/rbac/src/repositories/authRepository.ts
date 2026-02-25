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
 * Store a refresh token in database (primary) and Redis (secondary cache)
 */
export async function storeRefreshToken(data: {
  user_id: string;
  token: string;
  expires_at: Date;
  device_info?: string;
}): Promise<void> {
  const tokenHash = crypto
    .createHash("sha256")
    .update(data.token)
    .digest("hex");

  // 1. Store in Database (Primary)
  try {
    await query(
      `INSERT INTO refresh_tokens (token_hash, user_id, expires_at, device_info)
       VALUES ($1, $2, $3, $4)`,
      [tokenHash, data.user_id, data.expires_at, data.device_info],
    );
  } catch (dbError: any) {
    console.error("Database error storing refresh token:", dbError.message);
    // Don't throw - we still want to try Redis if possible,
    // though DB failing is a bigger issue.
  }

  // 2. Store in Redis (Cache)
  try {
    if (redis.status === "ready") {
      const userKey = `user_rt:${data.user_id}`;
      const redisKey = `rt:${tokenHash}`;

      const tokenData = {
        user_id: data.user_id,
        device_info: data.device_info,
        created_at: new Date().toISOString(),
      };

      await redis.setex(redisKey, REFRESH_TOKEN_TTL, JSON.stringify(tokenData));
      await redis.sadd(userKey, tokenHash);
      await redis.expire(userKey, REFRESH_TOKEN_TTL);
    }
  } catch (redisError: any) {
    console.warn(
      "Redis unavailable for storing refresh token:",
      redisError.message,
    );
  }
}

/**
 * Get a valid refresh token by hash, checking Redis cache then Database
 */
export async function getRefreshToken(
  token: string,
  userId: string,
): Promise<RefreshToken | null> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // 1. Try Redis Cache first
  if (redis.status === "ready") {
    try {
      const redisKey = `rt:${tokenHash}`;
      const data = await redis.get(redisKey);

      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.user_id === userId) {
          return {
            user_id: parsed.user_id,
            token_hash: tokenHash,
            expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL * 1000),
            revoked: false,
            device_info: parsed.device_info,
            created_at: new Date(parsed.created_at),
          };
        }
      }
    } catch (redisError: any) {
      console.warn("Redis error getting refresh token:", redisError.message);
    }
  }

  // 2. Fallback to Database
  try {
    const dbToken = await queryOne<RefreshToken>(
      `SELECT * FROM refresh_tokens 
       WHERE token_hash = $1 AND user_id = $2 AND revoked = false AND expires_at > NOW()`,
      [tokenHash, userId],
    );

    if (dbToken) {
      // Opt-in: Update Redis cache if it was a miss but Redis is ready
      if (redis.status === "ready") {
        const redisKey = `rt:${tokenHash}`;
        const tokenData = {
          user_id: dbToken.user_id,
          device_info: dbToken.device_info,
          created_at: dbToken.created_at || new Date().toISOString(),
        };
        redis.setex(redisKey, REFRESH_TOKEN_TTL, JSON.stringify(tokenData));
      }
      return dbToken;
    }
  } catch (dbError: any) {
    console.error("Database error getting refresh token:", dbError.message);
  }

  return null;
}

/**
 * Revoke a refresh token in both Database and Redis
 */
export async function revokeRefreshToken(token: string): Promise<boolean> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  // 1. Revoke in Database
  let dbResult = false;
  try {
    const result = await query(
      `UPDATE refresh_tokens SET revoked = true, revoked_at = NOW() 
       WHERE token_hash = $1`,
      [tokenHash],
    );
    // @ts-ignore - query helper might return count or result object depending on implementation
    dbResult = true;
  } catch (dbError: any) {
    console.error("Database error revoking refresh token:", dbError.message);
  }

  // 2. Revoke in Redis
  try {
    if (redis.status === "ready") {
      const redisKey = `rt:${tokenHash}`;
      const data = await redis.get(redisKey);
      if (data) {
        const parsed = JSON.parse(data);
        const userKey = `user_rt:${parsed.user_id}`;
        await redis.srem(userKey, tokenHash);
      }
      await redis.del(redisKey);
    }
  } catch (redisError: any) {
    console.warn("Redis error revoking refresh token:", redisError.message);
  }

  return dbResult;
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  const userKey = `user_rt:${userId}`;

  if (redis.status !== "ready") {
    return;
  }

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

    if (redis.status !== "ready") {
      return;
    }

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

    if (redis.status !== "ready") {
      return false;
    }

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
