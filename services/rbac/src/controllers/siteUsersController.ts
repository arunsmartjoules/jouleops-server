/**
 * Site Users Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import siteUsersRepository from "../repositories/siteUsersRepository";
import { logActivity } from "../repositories/logsRepository";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendServerError,
} from "@smartops/shared";

interface AuthRequest extends Request {
  user?: {
    user_id: string;
  };
}

export const getAll = async (req: Request, res: Response) => {
  try {
    const { page, limit, site_id, user_id, search } = req.query;
    const result = await siteUsersRepository.getAll({
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 50,
      siteId: site_id as string | undefined,
      userId: user_id as string | undefined,
      search: search as string | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get site users error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }
    const data = await siteUsersRepository.getBySite(siteId);
    return sendSuccess(res, data);
  } catch (error: any) {
    console.error("Get site users error:", error);
    return sendServerError(res, error);
  }
};

export const getByUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, "User ID is required");
    }
    const data = await siteUsersRepository.getByUser(userId);
    return sendSuccess(res, data);
  } catch (error: any) {
    console.error("Get user sites error:", error);
    return sendServerError(res, error);
  }
};

export const assignUser = async (req: AuthRequest, res: Response) => {
  try {
    const { site_id, user_id, user_ids, role_at_site, is_primary } = req.body;

    const usersToAssign = user_ids || (user_id ? [user_id] : []);

    if (!site_id || usersToAssign.length === 0) {
      return sendError(res, "Site ID and at least one User ID are required");
    }

    const results = [];
    const errors = [];

    for (const uid of usersToAssign) {
      try {
        const data = await siteUsersRepository.assignUser(
          site_id,
          uid,
          role_at_site || "staff",
          is_primary || false,
        );
        results.push(data);
      } catch (err: any) {
        console.error(
          `Assignment failed for user ${uid} at site ${site_id}:`,
          err.message,
        );
        errors.push({ user_id: uid, error: err.message });
      }
    }

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_USER_ASSIGN",
        module: "SITE_USERS",
        description: `Assigned ${results.length} user(s) to site ${site_id}`,
        metadata: { site_id, user_ids: usersToAssign, role_at_site },
        ip_address: req.ip,
      });
    }

    return sendSuccess(
      res,
      {
        assigned: results.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Assign user error:", error);
    return sendServerError(res, error);
  }
};

export const updateAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, userId } = req.params;
    if (!siteId || !userId) {
      return sendError(res, "Site ID and User ID are required");
    }
    const { role_at_site, is_primary } = req.body;

    const data = await siteUsersRepository.updateAssignment(siteId, userId, {
      role_at_site,
      is_primary,
    });

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_USER_UPDATE",
        module: "SITE_USERS",
        description: `Updated assignment for user ${userId} at site ${siteId}`,
        metadata: {
          site_id: siteId,
          user_id: userId,
          role_at_site,
          is_primary,
        },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, data);
  } catch (error: any) {
    console.error("Update assignment error:", error);
    return sendServerError(res, error);
  }
};

export const removeAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId, userId } = req.params;
    if (!siteId || !userId) {
      return sendError(res, "Site ID and User ID are required");
    }

    await siteUsersRepository.removeAssignment(siteId, userId);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_USER_REMOVE",
        module: "SITE_USERS",
        description: `Removed user ${userId} from site ${siteId}`,
        metadata: { site_id: siteId, user_id: userId },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, null, {
      message: "Assignment removed successfully",
    });
  } catch (error: any) {
    console.error("Remove assignment error:", error);
    return sendServerError(res, error);
  }
};

export default {
  getAll,
  getBySite,
  getByUser,
  assignUser,
  updateAssignment,
  removeAssignment,
};
