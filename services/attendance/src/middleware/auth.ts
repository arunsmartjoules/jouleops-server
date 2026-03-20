import jwt from "jsonwebtoken";
import { createPublicKey } from "crypto";
import type { Request, Response, NextFunction } from "express";

function getSupabasePublicKey(): string | null {
  const jwk = process.env.SUPABASE_JWT_JWK;
  if (!jwk) return null;
  try {
    const parsed = JSON.parse(jwk);
    return createPublicKey({ key: parsed, format: "jwk" })
      .export({ type: "spki", format: "pem" }) as string;
  } catch {
    return null;
  }
}

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

    let decoded: any;
    let isSupabaseToken = false;

    try {
      decoded = jwt.verify(token, secret);
    } catch (legacyErr: any) {
      const supabasePublicKey = getSupabasePublicKey();
      if (!supabasePublicKey) throw legacyErr;
      decoded = jwt.verify(token, supabasePublicKey, { algorithms: ["ES256"] });
      isSupabaseToken = true;
    }

    // Normalize Supabase token claims to the expected user shape
    if (isSupabaseToken) {
      const meta = decoded.user_metadata || {};
      const appMeta = decoded.app_metadata || {};
      decoded.user_id = decoded.sub;
      decoded.id = decoded.sub;
      // Supabase puts email at top-level; fall back to user_metadata.email
      decoded.email = decoded.email || meta.email || "";
      decoded.role = appMeta.role ?? meta.role ?? decoded.role ?? "user";
      decoded.is_admin = appMeta.is_admin ?? meta.is_admin ?? false;
      decoded.is_superadmin = appMeta.is_superadmin ?? meta.is_superadmin ?? false;

      // Resolve the real DB user_id via email — Supabase UUID ≠ DB user_id
      // Without this, attendance records get stored with the Supabase UUID
      // and can't be joined back to the users table
      try {
        const { getUserByEmail } = await import("../repositories/attendanceRepository.ts");
        const dbUser = await getUserByEmail(decoded.email);
        if (dbUser) {
          decoded.user_id = dbUser.user_id;
          decoded.id = dbUser.user_id;
        }
      } catch (dbErr) {
        console.error("[AttendanceAuthMiddleware] DB user_id resolution failed:", dbErr);
      }
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

  // Attach a virtual "system" user for API key auth to satisfy controller checks
  (req as any).user = {
    user_id: "system",
    role: "admin",
    is_admin: true,
    is_superadmin: true,
    email: "system@smartops.internal",
  };

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
