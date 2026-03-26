import express from "express";
import jwt from "jsonwebtoken";
import { verifyAnyAuth, type AuthRequest } from "../middleware/auth.ts";
import { sendSuccess, sendError } from "@jouleops/shared";
import type { Response } from "express";

const router = express.Router();

/**
 * POST /api/auth/powersync-token
 *
 * Issues a short-lived JWT that the PowerSync client uses to authenticate
 * against the self-hosted PowerSync service. The token carries the user_id
 * so sync rules can partition data by user.
 */
router.post(
  "/powersync-token",
  verifyAnyAuth,
  (req: AuthRequest, res: Response) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return sendError(res, "JWT_SECRET is not configured", { status: 500 });
    }

    const userId = req.user?.user_id;
    if (!userId) {
      return sendError(res, "User ID not found in token", {status: 401 });
    }

    const powerSyncToken = jwt.sign(
      {
        sub: userId,
        user_id: userId,
        role: req.user?.role,
        iat: Math.floor(Date.now() / 1000),
      },
      secret,
      { expiresIn: "1h" },
    );

    // PowerSync URL for mobile clients
    // Use POWERSYNC_PUBLIC_URL for external access, fallback to POWERSYNC_URL for internal
    const powersyncUrl =
      process.env.POWERSYNC_PUBLIC_URL || 
      process.env.POWERSYNC_URL || 
      "http://localhost:8080";

    return sendSuccess(res, {
      token: powerSyncToken,
      powersync_url: powersyncUrl,
      expires_in: 3600,
    });
  },
);

export default router;
