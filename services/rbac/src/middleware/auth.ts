import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { firebaseAdmin } from "@jouleops/shared";
import usersRepository from "../repositories/usersRepository.ts";
import {
  isTokenBlacklisted,
  validateApiKey,
} from "../repositories/authRepository.ts";

// Supabase public key logic removed in favor of Firebase Admin

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
 * Verify JWT token and attach user to request.
 * Accepts both legacy custom JWTs (JWT_SECRET) and Supabase JWTs (SUPABASE_JWT_SECRET).
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

    let decoded: any;
    let isFirebaseToken = false;

    try {
      // 1. Try Firebase verification first (Primary)
      decoded = await firebaseAdmin.auth().verifyIdToken(token);
      isFirebaseToken = true;
      
      // Normalize Firebase claims
      decoded.user_id = decoded.uid;
      decoded.id = decoded.uid;
    } catch (firebaseErr: any) {
      // 2. Fallback to legacy custom JWT if secret is present
      const secret = process.env.JWT_SECRET;
      if (secret) {
        try {
          const jwt = await import("jsonwebtoken");
          decoded = jwt.default.verify(token, secret);
        } catch (jwtErr) {
          throw firebaseErr; // Prefer Firebase error if both fail
        }
      } else {
        throw firebaseErr;
      }
    }

    // Check blacklist for legacy tokens
    if (!isFirebaseToken && decoded.jti && (await isTokenBlacklisted(decoded.jti))) {
      return res.status(401).json({
        success: false,
        error: "Token revoked",
      });
    }

    // Sync with database to resolve the real DB user_id and pull latest permissions
    if (decoded.email) {
      try {
        let dbUser = await usersRepository.getUserByEmail(decoded.email);
        
        // Auto-provision user if not found (Firebase is the source of truth)
        if (!dbUser && isFirebaseToken) {
          try {
            const newUser = {
              user_id: crypto.randomUUID(), 
              email: decoded.email,
              name: decoded.name || decoded.email.split("@")[0],
              role: "staff",
              is_active: true,
            };
            dbUser = await usersRepository.createUser(newUser);
            console.log(`[AuthMiddleware] Auto-provisioned user: ${decoded.email}`);
          } catch (createErr) {
            console.error("[AuthMiddleware] Auto-provisioning failed:", createErr);
          }
        }

        if (dbUser) {
          // Replace Identity Provider ID with the actual DB user_id
          decoded.user_id = dbUser.user_id;
          decoded.id = dbUser.user_id;
          decoded.role = dbUser.role || decoded.role || "user";
          decoded.is_superadmin = dbUser.is_superadmin || false;
          decoded.is_admin =
            decoded.is_superadmin ||
            dbUser.role?.toLowerCase() === "admin" ||
            dbUser.role?.toLowerCase() === "superadmin";
        }
      } catch (dbErr) {
        console.error("[AuthMiddleware] DB sync failed:", dbErr);
      }
    }

    // Ensure user_id and id are consistent (backward compatibility)
    if (!decoded.user_id && decoded.id) decoded.user_id = decoded.id;
    if (!decoded.id && decoded.user_id) decoded.id = decoded.user_id;
    decoded.is_firebase = isFirebaseToken;

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

  // 1. Check against static internal key (for consistency across services)
  const internalKey = process.env.INTERNAL_API_KEY || "smartops-internal-key";
  if (apiKey === internalKey) {
    req.apiKey = {
      id: 0,
      name: "Internal Service Key",
      scopes: ["*"], // Full access for internal key
    };
    return next();
  }

  // 2. Fall back to database validation for dynamic keys
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
