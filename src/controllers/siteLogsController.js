import siteLogsService from "../services/siteLogsService.js";

export const create = async (req, res) => {
  try {
    const result = await siteLogsService.createLog(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error(`Create site log error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getBySite = async (req, res) => {
  try {
    const { siteId } = req.params;
    const { page, limit, type } = req.query; // 'type' maps to log_name if provided

    const result = await siteLogsService.getLogsBySite(siteId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      log_name: type,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error(`Get site logs error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAll = async (req, res) => {
  req.params.siteId = "all";
  return getBySite(req, res);
};

export const update = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await siteLogsService.updateLog(id, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error(`Update site log error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const { id } = req.params;
    await siteLogsService.deleteLog(id);
    res.json({ success: true, message: "Log deleted successfully" });
  } catch (error) {
    console.error(`Delete site log error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const bulkRemove = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid IDs provided" });
    }
    const result = await siteLogsService.deleteLogs(ids);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error(`Bulk delete site log error:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export default { create, getBySite, getAll, update, remove, bulkRemove };
