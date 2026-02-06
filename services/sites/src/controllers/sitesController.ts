/**
 * Sites Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import sitesRepository from "../repositories/sitesRepository";
import { logActivity } from "../repositories/logsRepository";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@smartops/shared";

interface AuthRequest extends Request {
  user?: {
    user_id: string;
  };
}

export const create = async (req: AuthRequest, res: Response) => {
  try {
    const site = await sitesRepository.createSite(req.body);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_CREATE",
        module: "SITES",
        description: `Admin created site ${site.name}`,
        metadata: { target_site: site.site_id },
        ip_address: req.ip,
      });
    }

    return sendCreated(res, site);
  } catch (error: any) {
    console.error("Create site error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }
    const site = await sitesRepository.getSiteById(siteId);
    if (!site) {
      return sendNotFound(res, "Site");
    }
    return sendSuccess(res, site);
  } catch (error: any) {
    console.error("Get site error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const { is_active, city, search } = req.query;
    const sites = await sitesRepository.getAllSites({
      is_active:
        is_active === "true" ? true : is_active === "false" ? false : null,
      city: city as string | undefined,
      search: search as string | undefined,
    });
    return sendSuccess(res, sites);
  } catch (error: any) {
    console.error("Get sites error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }

    const existing = await sitesRepository.getSiteById(siteId);
    if (!existing) {
      return sendNotFound(res, "Site");
    }

    const site = await sitesRepository.updateSite(siteId, req.body);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_UPDATE",
        module: "SITES",
        description: `Admin updated site ${site.name}`,
        metadata: { target_site: site.site_id, updates: Object.keys(req.body) },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, site);
  } catch (error: any) {
    console.error("Update site error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: AuthRequest, res: Response) => {
  try {
    const { siteId } = req.params;
    if (!siteId) {
      return sendError(res, "Site ID is required");
    }

    const existing = await sitesRepository.getSiteById(siteId);
    if (!existing) {
      return sendNotFound(res, "Site");
    }

    await sitesRepository.deleteSite(siteId);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_DELETE",
        module: "SITES",
        description: `Admin deleted site ${existing.name}`,
        metadata: { target_site: siteId },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, null, { message: "Site deleted successfully" });
  } catch (error: any) {
    console.error("Delete site error:", error);
    return sendServerError(res, error);
  }
};

export const bulkUpdate = async (req: AuthRequest, res: Response) => {
  try {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "No site IDs provided");
    }

    const sites = await sitesRepository.bulkUpdateSites(ids, updates);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_BULK_UPDATE",
        module: "SITES",
        description: `Admin updated ${ids.length} sites`,
        metadata: { target_sites: ids, updates: Object.keys(updates) },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, { count: sites.length });
  } catch (error: any) {
    console.error("Bulk update sites error:", error);
    return sendServerError(res, error);
  }
};

export const bulkRemove = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return sendError(res, "No site IDs provided");
    }

    await sitesRepository.bulkDeleteSites(ids);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_BULK_DELETE",
        module: "SITES",
        description: `Admin deleted ${ids.length} sites`,
        metadata: { target_sites: ids },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, null, {
      message: `Successfully deleted ${ids.length} sites`,
    });
  } catch (error: any) {
    console.error("Bulk delete sites error:", error);
    return sendServerError(res, error);
  }
};

export default {
  create,
  getById,
  getAll,
  update,
  remove,
  bulkUpdate,
  bulkRemove,
};
