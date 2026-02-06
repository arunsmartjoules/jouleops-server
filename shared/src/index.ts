/**
 * @smartops/shared - Shared utilities for microservices
 */

// Database
export { query, queryOne, transaction, pool } from "./lib/db.ts";

// Redis & Caching
export {
  redis,
  healthCheck as redisHealthCheck,
  connectRedis,
  closeRedis,
} from "./lib/redis.ts";
export {
  cached,
  set as cacheSet,
  get as cacheGet,
  del,
  del as cacheDel,
  invalidate,
  invalidate as cacheInvalidate,
  TTL,
  CACHE_PREFIX,
} from "./lib/cache.ts";

// API Response Helpers
export {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendServerError,
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type ApiResponse,
} from "./utils/apiResponse.ts";

// Errors
export { AppError } from "./utils/AppError.ts";

// Middleware
export { errorHandler } from "./middleware/errorHandler.ts";

// Types
export type { AuthRequest } from "./types/express.ts";
