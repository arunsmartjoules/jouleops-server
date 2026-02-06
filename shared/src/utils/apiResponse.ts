/**
 * Standardized API Response Helpers
 *
 * Ensures consistent response format across all API endpoints.
 */

import type { Response } from "express";

// Response types
export interface ApiSuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Send a success response
 */
export function sendSuccess<T>(
  res: Response,
  data?: T,
  options: {
    message?: string;
    status?: number;
    pagination?: ApiSuccessResponse["pagination"];
  } = {},
): Response {
  const { message, status = 200, pagination } = options;

  const response: ApiSuccessResponse<T> = {
    success: true,
    ...(data !== undefined && { data }),
    ...(message && { message }),
    ...(pagination && { pagination }),
  };

  return res.status(status).json(response);
}

/**
 * Send an error response
 */
export function sendError(
  res: Response,
  error: string,
  options: {
    status?: number;
    code?: string;
    details?: any;
  } = {},
): Response {
  const { status = 400, code, details } = options;

  const response: ApiErrorResponse = {
    success: false,
    error,
    ...(code && { code }),
    ...(details && { details }),
  };

  return res.status(status).json(response);
}

/**
 * Send a 404 Not Found response
 */
export function sendNotFound(
  res: Response,
  resource: string = "Resource",
): Response {
  return sendError(res, `${resource} not found`, {
    status: 404,
    code: "NOT_FOUND",
  });
}

/**
 * Send a 401 Unauthorized response
 */
export function sendUnauthorized(
  res: Response,
  message: string = "Unauthorized",
): Response {
  return sendError(res, message, { status: 401, code: "UNAUTHORIZED" });
}

/**
 * Send a 403 Forbidden response
 */
export function sendForbidden(
  res: Response,
  message: string = "Forbidden",
): Response {
  return sendError(res, message, { status: 403, code: "FORBIDDEN" });
}

/**
 * Send a 500 Internal Server Error response
 */
export function sendServerError(
  res: Response,
  error: Error | string,
): Response {
  const message = error instanceof Error ? error.message : error;
  console.error("Server Error:", error);
  return sendError(res, message, { status: 500, code: "SERVER_ERROR" });
}

/**
 * Send a 201 Created response
 */
export function sendCreated<T>(
  res: Response,
  data: T,
  message?: string,
): Response {
  return sendSuccess(res, data, { status: 201, message });
}

export default {
  sendSuccess,
  sendError,
  sendNotFound,
  sendUnauthorized,
  sendForbidden,
  sendServerError,
  sendCreated,
};
