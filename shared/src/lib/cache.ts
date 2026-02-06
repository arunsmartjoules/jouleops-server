/**
 * Caching Utilities
 *
 * Implements cache-aside pattern for read-heavy queries.
 * Uses namespaced keys and aggressive TTLs.
 */

import redis from "./redis";

// Default TTL values (in seconds)
export const TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 900, // 15 minutes
  HOUR: 3600, // 1 hour
  DAY: 86400, // 24 hours
} as const;

// Cache key prefixes for namespacing
export const CACHE_PREFIX = {
  USER: "user:",
  SITE: "site:",
  ASSET: "asset:",
  TICKET: "ticket:",
  SESSION: "session:",
  TOKEN: "token:",
} as const;

/**
 * Cache-aside pattern: Check cache first, fetch from source if miss
 *
 * @param key - Cache key (will be prefixed automatically if using CACHE_PREFIX)
 * @param fetcher - Function to fetch data if cache miss
 * @param ttl - Time to live in seconds (default: 5 minutes)
 */
export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = TTL.MEDIUM,
): Promise<T> {
  try {
    // Check cache first
    const cached = await redis.get(key);

    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (error) {
    // Cache read failed, proceed to fetch
    console.warn("Cache read failed:", error);
  }

  // Cache miss - fetch from source
  const data = await fetcher();

  // Store in cache (fire and forget)
  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch (error) {
    console.warn("Cache write failed:", error);
  }

  return data;
}

/**
 * Set a value in cache with TTL
 */
export async function set(
  key: string,
  value: any,
  ttl: number = TTL.MEDIUM,
): Promise<void> {
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (error) {
    console.warn("Cache set failed:", error);
  }
}

/**
 * Get a value from cache
 */
export async function get<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(key);
    return cached ? (JSON.parse(cached) as T) : null;
  } catch (error) {
    console.warn("Cache get failed:", error);
    return null;
  }
}

/**
 * Delete a specific key from cache
 */
export async function del(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (error) {
    console.warn("Cache delete failed:", error);
  }
}

/**
 * Invalidate all keys matching a pattern
 *
 * @param pattern - Redis pattern (e.g., "user:*" to invalidate all user cache)
 */
export async function invalidate(pattern: string): Promise<number> {
  try {
    const keys = await redis.keys(pattern);

    if (keys.length === 0) {
      return 0;
    }

    await redis.del(...keys);
    return keys.length;
  } catch (error) {
    console.warn("Cache invalidation failed:", error);
    return 0;
  }
}

/**
 * Build a cache key with prefix and id
 */
export function buildKey(prefix: string, id: string | number): string {
  return `${prefix}${id}`;
}

/**
 * Increment a counter (useful for rate limiting)
 */
export async function incr(key: string, ttl?: number): Promise<number> {
  const value = await redis.incr(key);

  if (ttl && value === 1) {
    // Set TTL only on first increment
    await redis.expire(key, ttl);
  }

  return value;
}

export default {
  cached,
  set,
  get,
  del,
  invalidate,
  buildKey,
  incr,
  TTL,
  CACHE_PREFIX,
};
