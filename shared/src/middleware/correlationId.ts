import { v4 as uuidv4 } from "uuid";
import type { Request, Response, NextFunction } from "express";

/**
 * correlationId Middleware
 *
 * Attaches a unique requestId to every incoming request.
 * This ID should be propagated to all downstream logs for tracing.
 */
export const correlationId = (req: any, res: Response, next: NextFunction) => {
  const requestId = req.headers["x-request-id"] || uuidv4();

  // Attach to request object
  req.requestId = requestId;

  // Also attach to response headers for debugging
  res.setHeader("X-Request-Id", requestId);

  next();
};
