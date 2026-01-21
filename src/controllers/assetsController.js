import assetsService from "../services/assetsService.js";
import { validateAsset, VALID_STATUSES } from "../models/assetModel.js";

/**
 * Assets Controller
 */

export const create = async (req, res) => {
  try {
    const validation = validateAsset(req.body);
    if (!validation.isValid) {
      return res
        .status(400)
        .json({ success: false, errors: validation.errors });
    }

    const asset = await assetsService.createAsset(req.body);
    res.status(201).json({ success: true, data: asset });
  } catch (error) {
    console.error("Create asset error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const asset = await assetsService.getAssetById(req.params.assetId);
    if (!asset) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }
    res.json({ success: true, data: asset });
  } catch (error) {
    console.error("Get asset error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAll = async (req, res) => {
  try {
    const { page, limit, asset_type, status, floor, sortBy, sortOrder } =
      req.query;
    const result = await assetsService.getAssetsBySite("all", {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      asset_type,
      status,
      floor,
      sortBy,
      sortOrder,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get all assets error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getBySite = async (req, res) => {
  try {
    const { page, limit, asset_type, status, floor, sortBy, sortOrder } =
      req.query;
    const result = await assetsService.getAssetsBySite(req.params.siteId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      asset_type,
      status,
      floor,
      sortBy,
      sortOrder,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get assets error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getByType = async (req, res) => {
  try {
    const assets = await assetsService.getAssetsByType(
      req.params.siteId,
      req.params.assetType,
    );
    res.json({ success: true, data: assets });
  } catch (error) {
    console.error("Get assets error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getByLocation = async (req, res) => {
  try {
    const assets = await assetsService.getAssetsByLocation(
      req.params.siteId,
      req.params.location,
    );
    res.json({ success: true, data: assets });
  } catch (error) {
    console.error("Get assets error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const search = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res
        .status(400)
        .json({ success: false, error: "Search query (q) is required" });
    }

    const assets = await assetsService.searchAssets(req.params.siteId, q);
    res.json({ success: true, data: assets });
  } catch (error) {
    console.error("Search assets error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getUnderWarranty = async (req, res) => {
  try {
    const assets = await assetsService.getAssetsUnderWarranty(
      req.params.siteId,
    );
    res.json({ success: true, data: assets });
  } catch (error) {
    console.error("Get assets error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getWarrantyExpiring = async (req, res) => {
  try {
    const { days } = req.query;
    const assets = await assetsService.getAssetsWarrantyExpiring(
      req.params.siteId,
      parseInt(days) || 30,
    );
    res.json({ success: true, data: assets });
  } catch (error) {
    console.error("Get assets error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const existing = await assetsService.getAssetById(req.params.assetId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    const asset = await assetsService.updateAsset(req.params.assetId, req.body);
    res.json({ success: true, data: asset });
  } catch (error) {
    console.error("Update asset error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
      });
    }

    const existing = await assetsService.getAssetById(req.params.assetId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    const asset = await assetsService.updateAssetStatus(
      req.params.assetId,
      status,
    );
    res.json({ success: true, data: asset });
  } catch (error) {
    console.error("Update asset status error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const existing = await assetsService.getAssetById(req.params.assetId);
    if (!existing) {
      return res.status(404).json({ success: false, error: "Asset not found" });
    }

    await assetsService.deleteAsset(req.params.assetId);
    res.json({ success: true, message: "Asset deleted successfully" });
  } catch (error) {
    console.error("Delete asset error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getStats = async (req, res) => {
  try {
    const stats = await assetsService.getAssetStats(req.params.siteId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export default {
  create,
  getById,
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
};
