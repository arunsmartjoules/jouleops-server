import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError.ts";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  let error = { ...err };
  error.message = err.message;

  // Handle specific database errors (Postgres)
  if (err.code === "23505") {
    // Unique violation
    error = new AppError("Duplicate field value entered", 400);
  }
  if (err.code === "23503") {
    // ForeignKey violation
    error = new AppError(
      "Resource not found or relationship constraint violated",
      400,
    );
  }

  const statusCode =
    error instanceof AppError ? error.statusCode : error.statusCode || 500;
  const status =
    error instanceof AppError ? error.status : error.status || "error";
  const message = error.message || "Internal Server Error";

  if (statusCode === 500) {
    console.error(`[CRITICAL ERROR] [${req.method} ${req.url}]`, {
      message: err.message,
      stack: err.stack,
      code: err.code,
    });
  } else {
    console.warn(`[API ERROR] [${req.method} ${req.url}] ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    status,
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};
