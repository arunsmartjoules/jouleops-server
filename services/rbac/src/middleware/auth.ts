import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import {
  isTokenBlacklisted,
  validateApiKey,
} from "../repositories/authRepository.ts";

export interface AuthRequest extends Request {
  user?: {
    user_id: string;
    id?: string;
    role: string;
    email: string;
    is_admin?: boolean;
    is_superadmin?: boolean;
    jti?: string;
  };
  apiKey?: {
    id: number;
    name: string;
    scopes?: string[];
  };
}

/**
 * Verify JWT token and attach user to request
 */
export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Invalid token format",
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not defined");
    }

    const decoded = jwt.verify(token, secret) as any;

    // Check if token is blacklisted
    if (decoded.jti && (await isTokenBlacklisted(decoded.jti))) {
      return res.status(401).json({
        success: false,
        error: "Token revoked",
      });
    }

    // Ensure user_id and id are consistent (backward compatibility)
    if (!decoded.user_id && decoded.id) decoded.user_id = decoded.id;
    if (!decoded.id && decoded.user_id) decoded.id = decoded.user_id;

    req.user = decoded;
    next();
  } catch (error: any) {
    console.error("JWT Verification Error:", error.message, error.name);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Token expired",
      });
    }

    return res.status(401).json({
      success: false,
      error: "Invalid token",
    });
  }
};

/**
 * Optional auth - doesn't block if no token, but attaches user if valid
 */
export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const token = authHeader.split(" ")[1];

      if (token) {
        const secret = process.env.JWT_SECRET;

        if (secret) {
          const decoded = jwt.verify(token, secret) as any;

          // Check blacklist
          const isBlacklisted = decoded.jti
            ? await isTokenBlacklisted(decoded.jti)
            : false;

          if (!isBlacklisted) {
            req.user = decoded;
          }
        }
      }
    }

    next();
  } catch (error) {
    // Continue without user - token was invalid but that's OK for optional auth
    next();
  }
};

/**
 * Check if user has specific role(s)
 */
export const requireRole = (roles: string[] | string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Superadmins have access to everything
    if (req.user.is_superadmin) {
      return next();
    }

    // Normalize user role
    const userRole = req.user.role ? req.user.role.toLowerCase() : "";

    // Normalize allowed roles
    const allowedRoles = (Array.isArray(roles) ? roles : [roles]).map((r) =>
      r.toLowerCase(),
    );

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: "Insufficient permissions",
      });
    }

    next();
  };
};

/**
 * Require admin role
 */
export const requireAdmin = requireRole(["admin", "superadmin"]);

/**
 * API Key authentication (for webhooks, n8n, external integrations)
 */
export const verifyApiKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const apiKeyHeader = req.headers["x-api-key"];

  if (!apiKeyHeader) {
    return res.status(401).json({
      success: false,
      error: "API key required",
    });
  }

  // Ensure apiKey is a string
  const apiKey =
    (Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader) || "";

  try {
    const key = await validateApiKey(apiKey);

    if (!key) {
      return res.status(401).json({
        success: false,
        error: "Invalid API key",
      });
    }

    // Attach key info for scope checking if needed
    req.apiKey = {
      id: key.id,
      name: key.name,
      scopes: key.scopes,
    };

    next();
  } catch (err: any) {
    console.error("API Key Check Error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
    });
  }
};

/**
 * Combined auth - accepts either JWT or API key
 */
export const verifyAnyAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  // Check for API key first
  if (req.headers["x-api-key"]) {
    return verifyApiKey(req, res, next);
  }

  // Fall back to JWT
  return verifyToken(req, res, next);
};

export default {
  verifyToken,
  optionalAuth,
  requireRole,
  requireAdmin,
  verifyApiKey,
  verifyAnyAuth,
};
