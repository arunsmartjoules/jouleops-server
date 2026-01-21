import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import supabase from "../config/supabase.js";

/**
 * Authentication Middleware
 */

interface AuthRequest extends Request {
  user?: any;
}

// Verify JWT token
export const verifyToken = (
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

    const decoded: any = jwt.verify(token, secret);

    // Ensure user_id and id are consistent (alias id to user_id for backward compatibility)
    if (!decoded.user_id && decoded.id) decoded.user_id = decoded.id;
    if (!decoded.id && decoded.user_id) decoded.id = decoded.user_id;

    // Fallback: If role is missing in token, we might need to fetch it from DB
    // but to avoid blocking every request, we'll let the requireRole/verifyAdmin handle it
    // or we can do it here once. The plan says "only query Supabase if token lacks role".

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

// Optional auth - doesn't block if no token
export const optionalAuth = (
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
          const decoded = jwt.verify(token, secret);
          req.user = decoded;
        }
      }
    }
    next();
  } catch (error) {
    // Continue without user
    next();
  }
};

// Check if user has specific role
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

// API Key authentication (for n8n/webhooks)
export const verifyApiKey = async (
  req: Request,
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
    // Hash the incoming key
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    // Lookup in DB
    const { data: key, error } = await supabase
      .from("api_keys")
      .select("*")
      .eq("key_hash", keyHash)
      .single();

    if (error || !key) {
      return res.status(401).json({
        success: false,
        error: "Invalid API key",
      });
    }

    // Update last used asynchronously (don't await)
    supabase
      .from("api_keys")
      .update({ last_used_at: new Date() })
      .eq("id", key.id)
      .then(() => {});

    // (Optional) Attach key info to request if needed for scoping later
    // req.apiKey = key;

    next();
  } catch (err: any) {
    console.error("API Key Check Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Internal Server Error" });
  }
};

export default {
  verifyToken,
  optionalAuth,
  requireRole,
  verifyApiKey,
};
