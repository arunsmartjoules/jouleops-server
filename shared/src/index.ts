/**
 *@jouleops/shared - Shared utilities for microservices
 */

// Database
export {
  query,
  queryOne,
  transaction,
  pool,
  healthCheck as dbHealthCheck,
} from "./lib/db.ts";

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
export { asyncHandler } from "./utils/asyncHandler.ts";
export { logger, logWithRequest } from "./utils/logger.ts";
export { setupGracefulShutdown } from "./utils/shutdown.ts";

// Schemas
export * from "./types/schemas.ts";

// Middleware
export { errorHandler } from "./middleware/errorHandler.ts";
export { validate } from "./middleware/validate.ts";
export { correlationId } from "./middleware/correlationId.ts";

// Types
export type { AuthRequest } from "./types/express.ts";
