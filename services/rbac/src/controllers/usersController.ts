/**
 * Users Controller
 *
 * Full CRUD for user profiles.
 * Merged from profiles service into rbac service.
 */

import usersRepository from "../repositories/usersRepository.ts";
import { logActivity } from "../repositories/logsRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendForbidden,
  sendServerError,
} from "@jouleops/shared";

interface AuthRequest extends Request {
  user?: {
    user_id: string;
    is_superadmin?: boolean;
  };
}

export const create = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.is_superadmin) {
      return sendForbidden(res, "Only superadmins can create users");
    }

    const user = await usersRepository.createUser(req.body);

    await logActivity({
      user_id: req.user.user_id,
      action: "USER_CREATE",
      module: "USERS",
      description: `Admin created user ${user.email} with role ${user.role}`,
      metadata: { target_user: user.user_id },
      ip_address: req.ip,
    });

    return sendCreated(res, user);
  } catch (error: any) {
    console.error("Create user error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, "User ID is required");
    }
    const user = await usersRepository.getUserById(userId);
    if (!user) {
      return sendNotFound(res, "User");
    }
    return sendSuccess(res, user);
  } catch (error: any) {
    console.error("Get user error:", error);
    return sendServerError(res, error);
  }
};

export const getByPhone = async (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    if (!phone) {
      return sendError(res, "Phone number is required");
    }
    const user = await usersRepository.getUserByPhone(phone);
    if (!user) {
      return sendNotFound(res, "User");
    }
    return sendSuccess(res, user);
  } catch (error: any) {
    console.error("Get user error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const { role, is_active } = req.query;
    const users = await usersRepository.getUsersBySite(siteCode, {
      role: role as string | undefined,
      is_active:
        is_active === "true" ? true : is_active === "false" ? false : undefined,
    });
    return sendSuccess(res, users);
  } catch (error: any) {
    console.error("Get users error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const { page, limit, role, is_active, search, sort, filters } = req.query;
    const result = await usersRepository.getAllUsers({
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 50,
      role: role as string | undefined,
      is_active:
        is_active === "true" ? true : is_active === "false" ? false : undefined,
      search: search as string | undefined,
      sort: sort as string | undefined,
      filters: filters as string | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get users error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return sendError(res, "User ID is required");
    }
    const existing = await usersRepository.getUserById(userId);
    if (!existing) {
      return sendNotFound(res, "User");
    }

    const user = await usersRepository.updateUser(userId, req.body);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "USER_UPDATE",
        module: "USERS",
        description: `Admin updated user ${user.email}`,
        metadata: {
          target_user: user.user_id,
          updates: Object.keys(req.body).filter((k) => k !== "password"),
        },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, user);
  } catch (error: any) {
    console.error("Update user error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.is_superadmin) {
      return sendForbidden(res, "Only superadmins can delete users");
    }

    const { userId } = req.params;
    if (!userId) {
      return sendError(res, "User ID is required");
    }

    const existing = await usersRepository.getUserById(userId);
    if (!existing) {
      return sendNotFound(res, "User");
    }

    await usersRepository.deleteUser(userId);

    await logActivity({
      user_id: req.user.user_id,
      action: "USER_DELETE",
      module: "USERS",
      description: `Admin deleted user ${existing.email}`,
      metadata: { target_user: userId },
      ip_address: req.ip,
    });

    return sendSuccess(res, null, { message: "User deleted successfully" });
  } catch (error: any) {
    console.error("Delete user error:", error);
    return sendServerError(res, error);
  }
};

export const bulkUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "No user IDs provided");
    }

    const users = await usersRepository.bulkUpdateUsers(ids, updates);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "USER_BULK_UPDATE",
        module: "USERS",
        description: `Admin updated ${ids.length} users`,
        metadata: { target_users: ids, updates: Object.keys(updates) },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, { count: users.length });
  } catch (error: any) {
    console.error("Bulk update users error:", error);
    return sendServerError(res, error);
  }
};

export const bulkRemove = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.is_superadmin) {
      return sendForbidden(res, "Only superadmins can delete users");
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "No user IDs provided");
    }

    await usersRepository.bulkDeleteUsers(ids);

    await logActivity({
      user_id: req.user.user_id,
      action: "USER_BULK_DELETE",
      module: "USERS",
      description: `Admin deleted ${ids.length} users`,
      metadata: { target_users: ids },
      ip_address: req.ip,
    });

    return sendSuccess(res, null, {
      message: `Successfully deleted ${ids.length} users`,
    });
  } catch (error: any) {
    console.error("Bulk delete users error:", error);
    return sendServerError(res, error);
  }
};

export const bulkUpsert = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !req.user.is_superadmin) {
      return sendForbidden(res, "Only superadmins can bulk import users");
    }

    const { users } = req.body;
    if (!Array.isArray(users) || users.length === 0) {
      return sendError(res, "No users data provided");
    }

    const { count } = await usersRepository.bulkUpsertUsers(users);

    await logActivity({
      user_id: req.user.user_id,
      action: "USER_BULK_IMPORT",
      module: "USERS",
      description: `Admin imported/updated ${count} users`,
      metadata: { count },
      ip_address: req.ip,
    });

    return sendSuccess(res, { count }, { message: `Successfully imported ${count} users` });
  } catch (error: any) {
    console.error("Bulk upsert users error:", error);
    return sendServerError(res, error);
  }
};

export default {
  create,
  getById,
  getByPhone,
  getBySite,
  getAll,
  update,
  remove,
  bulkUpdate,
  bulkRemove,
  bulkUpsert,
};
