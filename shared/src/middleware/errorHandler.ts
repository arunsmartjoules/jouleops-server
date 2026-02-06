/**
 * Error Handler Middleware
 *
 * Central error handling for all Express routes.
 */

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.ts";

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const status = err instanceof AppError ? err.status : "error";
  const message = err.message || "Internal Server Error";

  if (statusCode === 500) {
    console.error(`[${req.method} ${req.url}] ${err.stack || message}`);
  } else {
    console.warn(`[${req.method} ${req.url}] ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    status,
    error: message,
  });
};
