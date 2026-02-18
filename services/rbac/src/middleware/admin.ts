import { verifyAnyAuth } from "./auth.ts";

// Special superadmin email (hardcoded for initial setup)
const SUPERADMIN_EMAIL = "arun.kumar@smartjoules.in";

// Middleware to check if user is admin or superadmin
export const requireAdmin = (req: any, res: any, next: any) => {
  // First verify the auth (JWT or API Key)
  verifyAnyAuth(req, res, () => {
    const user = req.user;

    if (!user) {
      // If no user (e.g. authenticated via API key), we check if it's the internal service key
      if (req.apiKey && req.apiKey.id === 0) {
        return next();
      }

      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Check if user is admin or superadmin (including special email)
    const isSuperAdminEmail = user.email === SUPERADMIN_EMAIL;
    const isAdmin =
      user.role === "admin" ||
      user.is_superadmin === true ||
      user.role === "Admin" ||
      isSuperAdminEmail;

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Admin privileges required.",
      });
    }

    next();
  });
};

// Middleware to check if user is superadmin
export const requireSuperAdmin = (req: any, res: any, next: any) => {
  // First verify the auth (JWT or API Key)
  verifyAnyAuth(req, res, () => {
    const user = req.user;

    if (!user) {
      // If no user (e.g. authenticated via API key), we check if it's the internal service key
      if (req.apiKey && req.apiKey.id === 0) {
        return next();
      }

      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Check for superadmin (including special email)
    const isSuperAdminEmail = user.email === SUPERADMIN_EMAIL;
    if (!user.is_superadmin && !isSuperAdminEmail) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Superadmin privileges required.",
      });
    }

    next();
  });
};
