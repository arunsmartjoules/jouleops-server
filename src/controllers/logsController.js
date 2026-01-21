import logsService from "../services/logsService.js";

/**
 * Logs Controller
 */

export const getAll = async (req, res) => {
  try {
    const { page, limit, module, action, search, from, to } = req.query;
    const result = await logsService.getAllLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      module,
      action,
      search,
      from,
      to,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get logs error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const create = async (req, res) => {
  try {
    const { action, module, description, site_id, device_info, metadata } =
      req.body;
    const user_id = req.user.user_id; // From verifyToken middleware

    await logsService.logActivity({
      user_id,
      site_id,
      action,
      module,
      description,
      ip_address: req.ip,
      device_info,
      metadata,
    });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Create log error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getTrends = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const trends = await logsService.getErrorTrends(days);
    res.json({ success: true, data: trends });
  } catch (error) {
    console.error("Get trends error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export default {
  getAll,
  create,
  getTrends,
};
