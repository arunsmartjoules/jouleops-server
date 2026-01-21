import pmInstancesService from "../services/pmInstancesService.js";
import {
  validatePMInstance,
  VALID_STATUSES,
} from "../models/pmInstanceModel.js";

/**
 * PM Instances Controller
 */

export const create = async (req, res) => {
  try {
    const validation = validatePMInstance(req.body);
    if (!validation.isValid) {
      return res
        .status(400)
        .json({ success: false, errors: validation.errors });
    }

    const instance = await pmInstancesService.createPMInstance(req.body);
    res.status(201).json({ success: true, data: instance });
  } catch (error) {
    console.error("Create PM instance error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const instance = await pmInstancesService.getPMInstanceById(
      req.params.instanceId,
    );
    if (!instance) {
      return res
        .status(404)
        .json({ success: false, error: "PM instance not found" });
    }
    res.json({ success: true, data: instance });
  } catch (error) {
    console.error("Get PM instance error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getBySite = async (req, res) => {
  try {
    const { page, limit, status, frequency, asset_type, sortBy, sortOrder } =
      req.query;
    const result = await pmInstancesService.getPMInstancesBySite(
      req.params.siteId,
      {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        status,
        frequency,
        asset_type,
        sortBy,
        sortOrder,
      },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get PM instances error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getByAsset = async (req, res) => {
  try {
    const instances = await pmInstancesService.getPMInstancesByAsset(
      req.params.assetId,
    );
    res.json({ success: true, data: instances });
  } catch (error) {
    console.error("Get PM instances error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getPending = async (req, res) => {
  try {
    const { days } = req.query;
    const instances = await pmInstancesService.getPendingPMInstances(
      req.params.siteId,
      parseInt(days) || 7,
    );
    res.json({ success: true, data: instances });
  } catch (error) {
    console.error("Get pending PM instances error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getOverdue = async (req, res) => {
  try {
    const instances = await pmInstancesService.getOverduePMInstances(
      req.params.siteId,
    );
    res.json({ success: true, data: instances });
  } catch (error) {
    console.error("Get overdue PM instances error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const existing = await pmInstancesService.getPMInstanceById(
      req.params.instanceId,
    );
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "PM instance not found" });
    }

    const instance = await pmInstancesService.updatePMInstance(
      req.params.instanceId,
      req.body,
    );
    res.json({ success: true, data: instance });
  } catch (error) {
    console.error("Update PM instance error:", error);
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

    const existing = await pmInstancesService.getPMInstanceById(
      req.params.instanceId,
    );
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "PM instance not found" });
    }

    const instance = await pmInstancesService.updatePMInstanceStatus(
      req.params.instanceId,
      status,
      req.user?.user_id,
    );
    res.json({ success: true, data: instance });
  } catch (error) {
    console.error("Update PM instance status error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateProgress = async (req, res) => {
  try {
    const { progress } = req.body;
    if (progress === undefined || progress < 0 || progress > 100) {
      return res.status(400).json({
        success: false,
        error: "progress must be between 0 and 100",
      });
    }

    const instance = await pmInstancesService.updatePMInstanceProgress(
      req.params.instanceId,
      progress,
    );
    res.json({ success: true, data: instance });
  } catch (error) {
    console.error("Update progress error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const existing = await pmInstancesService.getPMInstanceById(
      req.params.instanceId,
    );
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "PM instance not found" });
    }

    await pmInstancesService.deletePMInstance(req.params.instanceId);
    res.json({ success: true, message: "PM instance deleted successfully" });
  } catch (error) {
    console.error("Delete PM instance error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getStats = async (req, res) => {
  try {
    const stats = await pmInstancesService.getPMStats(req.params.siteId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAll = async (req, res) => {
  req.params.siteId = "all";
  return getBySite(req, res);
};

export default {
  create,
  getById,
  getAll,
  getBySite,
  getByAsset,
  getPending,
  getOverdue,
  update,
  updateStatus,
  updateProgress,
  remove,
  getStats,
};
