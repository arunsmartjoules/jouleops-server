/**
 * Sites Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import sitesRepository from "../repositories/sitesRepository.ts";
import { logActivity } from "../repositories/logsRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@jouleops/shared";

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
        metadata: { target_site: site.site_code },
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
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const site = await sitesRepository.getSiteById(siteCode);
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
    const { is_active, city, search, project_type } = req.query;
    const sites = await sitesRepository.getAllSites({
      is_active:
        is_active === "true" ? true : is_active === "false" ? false : null,
      city: city as string | undefined,
      search: search as string | undefined,
      project_type: project_type as string | undefined,
    });
    return sendSuccess(res, sites);
  } catch (error: any) {
    console.error("Get sites error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: AuthRequest, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }

    const existing = await sitesRepository.getSiteById(siteCode);
    if (!existing) {
      return sendNotFound(res, "Site");
    }

    const site = await sitesRepository.updateSite(siteCode, req.body);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_UPDATE",
        module: "SITES",
        description: `Admin updated site ${site.name}`,
        metadata: {
          target_site: site.site_code,
          updates: Object.keys(req.body),
        },
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
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }

    const existing = await sitesRepository.getSiteById(siteCode);
    if (!existing) {
      return sendNotFound(res, "Site");
    }

    await sitesRepository.deleteSite(siteCode);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_DELETE",
        module: "SITES",
        description: `Admin deleted site ${existing.name}`,
        metadata: { target_site: siteCode },
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
    const { codes, updates } = req.body;
    if (!Array.isArray(codes) || codes.length === 0) {
      return sendError(res, "No site codes provided");
    }

    const sites = await sitesRepository.bulkUpdateSites(codes, updates);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_BULK_UPDATE",
        module: "SITES",
        description: `Admin updated ${codes.length} sites`,
        metadata: { target_sites: codes, updates: Object.keys(updates) },
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
    const { codes } = req.body;
    if (!Array.isArray(codes) || codes.length === 0) {
      return sendError(res, "No site codes provided");
    }

    await sitesRepository.bulkDeleteSites(codes);

    if (req.user) {
      await logActivity({
        user_id: req.user.user_id,
        action: "SITE_BULK_DELETE",
        module: "SITES",
        description: `Admin deleted ${codes.length} sites`,
        metadata: { target_sites: codes },
        ip_address: req.ip,
      });
    }

    return sendSuccess(res, null, {
      message: `Successfully deleted ${codes.length} sites`,
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
