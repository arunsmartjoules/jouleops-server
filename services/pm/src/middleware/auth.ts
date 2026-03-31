import type { Request, Response, NextFunction } from "express";
import { firebaseAdmin } from "@jouleops/shared";

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
}

/**
 * Verify JWT token and attach user to request.
 * Accepts both legacy custom JWTs (JWT_SECRET) and Supabase JWTs (ES256 via SUPABASE_JWT_JWK).
 */
export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  let authHeader = "";
  try {
    authHeader = req.headers.authorization || "";
    console.log(
      `[PM Auth] Header received:`,
      authHeader ? authHeader.substring(0, 20) + "..." : "NONE",
    );

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

    // Sync with database to resolve the real DB user_id (Identity Provider ID ≠ DB user_id)
    if (decoded.email) {
      try {
        const { queryOne } = await import("@jouleops/shared");
        const dbUser = await queryOne<{ user_id: string; role: string; is_superadmin: boolean }>(
          `SELECT user_id, role, is_superadmin FROM users WHERE email = $1 OR platform_email = $1 LIMIT 1`,
          [decoded.email],
        );
        if (dbUser) {
          decoded.user_id = dbUser.user_id;
          decoded.id = dbUser.user_id;
          decoded.role = dbUser.role || decoded.role || "user";
          decoded.is_superadmin = dbUser.is_superadmin || false;
        }
      } catch (dbErr) {
        console.error("[PMAuthMiddleware] DB user_id resolution failed:", dbErr);
      }
    }

    // Ensure user_id and id are consistent (backward compatibility)
    if (!decoded.user_id && decoded.id) decoded.user_id = decoded.id;
    if (!decoded.id && decoded.user_id) decoded.id = decoded.user_id;

    req.user = decoded;
    console.log(`[PM Auth] Successfully decoded user:`, decoded.user_id);
    next();
  } catch (error: any) {
    console.error(
      `[PM Auth] JWT Verification Error: ${error.message} - Token: ${authHeader ? authHeader.substring(0, 20) + "..." : "NONE"}`,
    );

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Token expired",
      });
    }

    return res.status(401).json({
      success: false,
      error: "Invalid token",
      details: error.message,
      name: error.name,
    });
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
 * Simple API Key verification for service-to-service comms
 */
export const verifyApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const apiKey = req.headers["x-api-key"];
  const validKey = process.env.INTERNAL_API_KEY || "smartops-internal-key";

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({
      success: false,
      error: "Invalid or missing API Key",
    });
  }
  next();
};

/**
 * Require admin role
 */
export const requireAdmin = requireRole(["admin", "superadmin"]);

/**
 * Combined auth - accepts either JWT or API key
 */
export const verifyAnyAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Check for API key first
  if (req.headers["x-api-key"]) {
    return verifyApiKey(req, res, next);
  }

  // Fall back to JWT
  return verifyToken(req as AuthRequest, res, next);
};

export default {
  verifyToken,
  verifyApiKey,
  requireRole,
  requireAdmin,
  verifyAnyAuth,
};
