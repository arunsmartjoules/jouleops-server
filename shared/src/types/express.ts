/**
 * Express Type Extensions
 *
 * Extended types for Express request/response with proper typing
 */

import type { Request, Response } from "express";
import type { ParamsDictionary } from "express-serve-static-core";

/**
 * Request with authenticated user
 */
export interface AuthRequest extends Request {
  user?: {
    user_id: string;
    email?: string;
    role?: string;
    is_superadmin?: boolean;
  };
}

/**
 * Request with required route params
 * Use this when you need type-safe access to route params
 */
export interface ParamRequest<
  P extends ParamsDictionary = ParamsDictionary,
> extends Request {
  params: P;
}

/**
 * Authenticated request with required route params
 */
export interface AuthParamRequest<
  P extends ParamsDictionary = ParamsDictionary,
> extends AuthRequest {
  params: P;
}

/**
 * Common param patterns
 */
export interface IdParams {
  id: string;
}

export interface SiteIdParams {
  siteId: string;
}

export interface UserIdParams {
  userId: string;
}

export interface SiteUserParams {
  siteId: string;
  userId: string;
}

export interface AssetIdParams {
  assetId: string;
}

export interface ComplaintIdParams {
  complaintId: string;
}

/**
 * Helper to safely get a required param
 * Throws error if param is missing
 */
export function requireParam(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

/**
 * Helper to parse integer param
 */
export function parseIntParam(
  value: string | undefined,
  defaultValue?: number,
): number | undefined {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
