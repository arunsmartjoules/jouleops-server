/**
 * Assets Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import assetsRepository from "../repositories/assetsRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@jouleops/shared";

const VALID_STATUSES = ["Active", "Under Maintenance", "Inactive", "Disposed"];

export const create = async (req: Request, res: Response) => {
  try {
    const asset = await assetsRepository.createAsset(req.body);
    return sendCreated(res, asset);
  } catch (error: any) {
    console.error("Create asset error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;
    if (!assetId) {
      return sendError(res, "Asset ID is required");
    }
    const asset = await assetsRepository.getAssetById(assetId);
    if (!asset) {
      return sendNotFound(res, "Asset");
    }
    return sendSuccess(res, asset);
  } catch (error: any) {
    console.error("Get asset error:", error);
    return sendServerError(res, error);
  }
};

export const getByQrId = async (req: Request, res: Response) => {
  try {
    const { qrId } = req.params;
    if (!qrId) {
      return sendError(res, "QR ID is required");
    }
    const asset = await assetsRepository.getAssetByQrId(qrId);
    if (!asset) {
      return sendNotFound(res, "Asset for this QR code");
    }
    return sendSuccess(res, asset);
  } catch (error: any) {
    console.error("Get asset by QR ID error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  try {
    const {
      page,
      limit,
      asset_type,
      equipment_type,
      category,
      status,
      floor,
      sortBy,
      sortOrder,
      search,
    } = req.query;
    const result = await assetsRepository.getAssetsBySite("all", {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 50,
      asset_type: asset_type as string | undefined,
      equipment_type: equipment_type as string | undefined,
      category: category as string | undefined,
      status: status as string | undefined,
      floor: floor as string | undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
      search: search as string | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get all assets error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const {
      page,
      limit,
      asset_type,
      equipment_type,
      status,
      floor,
      sortBy,
      sortOrder,
    } = req.query;
    const result = await assetsRepository.getAssetsBySite(siteCode, {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 50,
      asset_type: asset_type as string | undefined,
      equipment_type: equipment_type as string | undefined,
      status: status as string | undefined,
      floor: floor as string | undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
    });
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get assets error:", error);
    return sendServerError(res, error);
  }
};

export const getByType = async (req: Request, res: Response) => {
  try {
    const { siteCode, assetType } = req.params;
    if (!siteCode || !assetType) {
      return sendError(res, "Site Code and Asset Type are required");
    }
    const assets = await assetsRepository.getAssetsByType(siteCode, assetType);
    return sendSuccess(res, assets);
  } catch (error: any) {
    console.error("Get assets error:", error);
    return sendServerError(res, error);
  }
};

export const getByLocation = async (req: Request, res: Response) => {
  try {
    const { siteCode, location } = req.params;
    if (!siteCode || !location) {
      return sendError(res, "Site Code and Location are required");
    }
    const assets = await assetsRepository.getAssetsByLocation(
      siteCode,
      location,
    );
    return sendSuccess(res, assets);
  } catch (error: any) {
    console.error("Get assets error:", error);
    return sendServerError(res, error);
  }
};

export const search = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const { q } = req.query;
    if (!q) {
      return sendError(res, "Search query (q) is required");
    }

    const assets = await assetsRepository.searchAssets(siteCode, q as string);
    return sendSuccess(res, assets);
  } catch (error: any) {
    console.error("Search assets error:", error);
    return sendServerError(res, error);
  }
};

export const getUnderWarranty = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const assets = await assetsRepository.getAssetsUnderWarranty(siteCode);
    return sendSuccess(res, assets);
  } catch (error: any) {
    console.error("Get assets error:", error);
    return sendServerError(res, error);
  }
};

export const getWarrantyExpiring = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const { days } = req.query;
    const assets = await assetsRepository.getAssetsWarrantyExpiring(
      siteCode,
      parseInt(days as string) || 30,
    );
    return sendSuccess(res, assets);
  } catch (error: any) {
    console.error("Get assets error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;
    if (!assetId) {
      return sendError(res, "Asset ID is required");
    }
    const existing = await assetsRepository.getAssetById(assetId);
    if (!existing) {
      return sendNotFound(res, "Asset");
    }

    const asset = await assetsRepository.updateAsset(assetId, req.body);
    return sendSuccess(res, asset);
  } catch (error: any) {
    console.error("Update asset error:", error);
    return sendServerError(res, error);
  }
};

export const updateStatus = async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;
    if (!assetId) {
      return sendError(res, "Asset ID is required");
    }
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return sendError(
        res,
        `status must be one of: ${VALID_STATUSES.join(", ")}`,
      );
    }

    const existing = await assetsRepository.getAssetById(assetId);
    if (!existing) {
      return sendNotFound(res, "Asset");
    }

    const asset = await assetsRepository.updateAssetStatus(assetId, status);
    return sendSuccess(res, asset);
  } catch (error: any) {
    console.error("Update asset status error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { assetId } = req.params;
    if (!assetId) {
      return sendError(res, "Asset ID is required");
    }
    const existing = await assetsRepository.getAssetById(assetId);
    if (!existing) {
      return sendNotFound(res, "Asset");
    }

    await assetsRepository.deleteAsset(assetId);
    return sendSuccess(res, null, { message: "Asset deleted successfully" });
  } catch (error: any) {
    console.error("Delete asset error:", error);
    return sendServerError(res, error);
  }
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params;
    if (!siteCode) {
      return sendError(res, "Site Code is required");
    }
    const stats = await assetsRepository.getAssetStats(siteCode);
    return sendSuccess(res, stats);
  } catch (error: any) {
    console.error("Get stats error:", error);
    return sendServerError(res, error);
  }
};

export const bulkUpsert = async (req: Request, res: Response) => {
  try {
    const { assets } = req.body;
    if (!Array.isArray(assets) || assets.length === 0) {
      return sendError(res, "No assets data provided");
    }

    const { count } = await assetsRepository.bulkUpsertAssets(assets);

    return sendSuccess(res, { count }, { message: `Successfully imported ${count} assets` });
  } catch (error: any) {
    console.error("Bulk upsert assets error:", error);
    return sendServerError(res, error);
  }
};

export default {
  create,
  getById,
  getByQrId,
  getAll,
  getBySite,
  getByType,
  getByLocation,
  search,
  getUnderWarranty,
  getWarrantyExpiring,
  update,
  updateStatus,
  remove,
  getStats,
  bulkUpsert,
};
