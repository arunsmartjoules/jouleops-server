/**
 * Redis Client
 *
 * Used for caching, session storage, and job queues.
 * Redis is non-authoritative - database is source of truth.
 */

import { logger } from "../utils/logger.ts";
import Redis from "ioredis";

const getRedisUrl = (): string => {
  return process.env.REDIS_URL || "redis://localhost:6379";
};

// Create Redis client with fail-fast strategy
// Redis is optional - app should work without it (just no token refresh/caching)
export const redis = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: 1, // Fail fast
  retryStrategy: (times) => {
    if (times > 3) {
      logger.error("Redis: Max retry attempts reached, giving up");
      return null; // Stop retrying
    }
    const delay = Math.min(times * 100, 1000);
    return delay;
  },
  lazyConnect: true, // Don't connect immediately
  enableOfflineQueue: false, // Fail immediately if not connected
  connectTimeout: 5000, // 5 second connection timeout
});

// Event handlers
redis.on("connect", () => {
  logger.info("Redis: Connected");
});

redis.on("ready", () => {
  logger.info("Redis: Ready to receive commands");
});

redis.on("error", (err) => {
  if (!err.message.includes("ECONNREFUSED")) {
    logger.error("Redis error", { error: err.message });
  }
});

redis.on("close", () => {
  logger.info("Redis: Connection closed");
});

/**
 * Health check for Redis connectivity
 */
export async function healthCheck(): Promise<{
  connected: boolean;
  latency: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    await redis.ping();
    return {
      connected: true,
      latency: Date.now() - start,
    };
  } catch (error: any) {
    return {
      connected: false,
      latency: Date.now() - start,
      error: error.message,
    };
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  await redis.quit();
}

/**
 * Connect to Redis (call on startup)
 */
export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (error: any) {
    // If already connected, ignore
    if (!error.message.includes("already")) {
      console.error("Redis connection failed:", error.message);
    }
  }
}

export default redis;
