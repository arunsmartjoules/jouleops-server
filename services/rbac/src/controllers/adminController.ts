/**
 * Admin Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import adminRepository from "../repositories/adminRepository";
import { logActivity } from "../repositories/logsRepository";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendError,
  sendNotFound,
  sendForbidden,
  sendServerError,
} from "@jouleops/shared";

interface AuthRequest extends Request {
  user?: {
    user_id: string;
    is_superadmin?: boolean;
    email?: string;
  };
}

export const listAdmins = async (req: Request, res: Response) => {
  try {
    const admins = await adminRepository.listAdmins();
    return sendSuccess(res, admins);
  } catch (error: any) {
    console.error("List admins error:", error);
    return sendServerError(res, error);
  }
};

export const promoteToAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return sendError(res, "User ID is required");
    }

    const data = await adminRepository.promoteToAdmin(userId);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "PROMOTE_TO_ADMIN",
        module: "ADMIN",
        description: `Promoted user ${data.email} to admin`,
        ip_address: req.ip,
        device_info: req.headers["user-agent"],
      });
    }

    return sendSuccess(res, data, {
      message: "User promoted to admin successfully",
    });
  } catch (error: any) {
    console.error("Promote to admin error:", error);
    return sendServerError(res, error);
  }
};

export const demoteAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return sendError(res, "User ID is required");
    }

    // Check if user is superadmin
    const isSuperadmin = await adminRepository.isSuperadmin(userId);
    if (isSuperadmin) {
      return sendError(
        res,
        "Cannot demote superadmin. Change superadmin first.",
      );
    }

    const data = await adminRepository.demoteAdmin(userId);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "DEMOTE_ADMIN",
        module: "ADMIN",
        description: `Demoted admin ${data.email} to staff`,
        ip_address: req.ip,
        device_info: req.headers["user-agent"],
      });
    }

    return sendSuccess(res, data, { message: "Admin demoted successfully" });
  } catch (error: any) {
    console.error("Demote admin error:", error);
    return sendServerError(res, error);
  }
};

export const requestSuperadminChange = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { newSuperadminUserId } = req.body;

    if (!newSuperadminUserId) {
      return sendError(res, "New superadmin user ID is required");
    }

    // Verify current user is superadmin
    if (!req.user?.is_superadmin) {
      return sendForbidden(res, "Only superadmin can change superadmin");
    }

    // Check if new superadmin exists and is an admin
    const newUser = await adminRepository.getUserById(newSuperadminUserId);

    if (!newUser) {
      return sendNotFound(res, "User");
    }

    if (newUser.role !== "admin") {
      return sendError(res, "User must be an admin to become superadmin");
    }

    // Get current superadmin's email
    const currentSuperadmin = await adminRepository.getUserById(
      req.user.user_id,
    );

    // Send verification code
    const emailService = await import("../services/email.service.ts");
    const code = emailService.generateVerificationCode();
    emailService.storeVerificationCode(
      currentSuperadmin!.email,
      code,
      "superadmin-change",
      newSuperadminUserId,
    );
    await emailService.sendVerificationEmail(
      currentSuperadmin!.email,
      code,
      "superadmin-change",
    );

    return sendSuccess(res, null, {
      message: "Verification code sent to your email",
    });
  } catch (error: any) {
    console.error("Request superadmin change error:", error);
    return sendServerError(res, error);
  }
};

export const verifySuperadminChange = async (
  req: AuthRequest,
  res: Response,
) => {
  try {
    const { code } = req.body;

    if (!code) {
      return sendError(res, "Verification code is required");
    }

    // Verify current user is superadmin
    if (!req.user?.is_superadmin) {
      return sendForbidden(res, "Only superadmin can change superadmin");
    }

    // Get current superadmin email
    const currentSuperadmin = await adminRepository.getUserById(
      req.user.user_id,
    );

    // Verify code
    const emailService = await import("../services/email.service.ts");
    const verification = await emailService.verifyCode(
      currentSuperadmin!.email,
      code,
    );

    if (!verification || verification.type !== "superadmin-change") {
      return sendError(res, "Invalid or expired verification code");
    }

    const newSuperadminUserId = verification.userId as string;

    // Remove superadmin from current user
    await adminRepository.removeSuperadmin(req.user.user_id);

    // Set new superadmin
    let newSuperadmin;
    try {
      newSuperadmin = await adminRepository.setSuperadmin(newSuperadminUserId);
    } catch (err) {
      // Rollback - restore current superadmin
      await adminRepository.setSuperadmin(req.user.user_id);
      throw err;
    }

    // Delete verification code
    emailService.deleteVerificationCode(currentSuperadmin!.email);

    // Log activity
    await logActivity({
      user_id: req.user.user_id,
      action: "CHANGE_SUPERADMIN",
      module: "ADMIN",
      description: `Superadmin changed from ${currentSuperadmin!.email} to ${newSuperadmin.email}`,
      ip_address: req.ip,
      device_info: req.headers["user-agent"],
    });

    return sendSuccess(res, newSuperadmin, {
      message: "Superadmin changed successfully",
    });
  } catch (error: any) {
    console.error("Verify superadmin change error:", error);
    return sendServerError(res, error);
  }
};

export default {
  listAdmins,
  promoteToAdmin,
  demoteAdmin,
  requestSuperadminChange,
  verifySuperadminChange,
};
