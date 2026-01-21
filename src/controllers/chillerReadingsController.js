import chillerReadingsService from "../services/chillerReadingsService.js";
import { validateChillerReading } from "../models/chillerReadingModel.js";

/**
 * Chiller Readings Controller
 */

export const create = async (req, res) => {
  try {
    const validation = validateChillerReading(req.body);
    if (!validation.isValid) {
      return res
        .status(400)
        .json({ success: false, errors: validation.errors });
    }

    const reading = await chillerReadingsService.createChillerReading(req.body);
    res.status(201).json({ success: true, data: reading });
  } catch (error) {
    console.error("Create chiller reading error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const reading = await chillerReadingsService.getChillerReadingById(
      req.params.id,
    );
    if (!reading) {
      return res
        .status(404)
        .json({ success: false, error: "Chiller reading not found" });
    }
    res.json({ success: true, data: reading });
  } catch (error) {
    console.error("Get chiller reading error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getBySite = async (req, res) => {
  try {
    const { page, limit, chiller_id, date_from, date_to, sortBy, sortOrder } =
      req.query;
    const result = await chillerReadingsService.getChillerReadingsBySite(
      req.params.siteId,
      {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
        chiller_id,
        date_from,
        date_to,
        sortBy,
        sortOrder,
      },
    );
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get chiller readings error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getByChiller = async (req, res) => {
  try {
    const { limit, date_from, date_to } = req.query;
    const readings = await chillerReadingsService.getChillerReadingsByChiller(
      req.params.chillerId,
      {
        limit: parseInt(limit) || 50,
        date_from,
        date_to,
      },
    );
    res.json({ success: true, data: readings });
  } catch (error) {
    console.error("Get chiller readings error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getLatest = async (req, res) => {
  try {
    const reading = await chillerReadingsService.getLatestReadingByChiller(
      req.params.chillerId,
    );
    if (!reading) {
      return res
        .status(404)
        .json({ success: false, error: "No readings found" });
    }
    res.json({ success: true, data: reading });
  } catch (error) {
    console.error("Get latest reading error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getByDateShift = async (req, res) => {
  try {
    const readings = await chillerReadingsService.getReadingsByDateShift(
      req.params.siteId,
      req.params.dateShift,
    );
    res.json({ success: true, data: readings });
  } catch (error) {
    console.error("Get readings error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const existing = await chillerReadingsService.getChillerReadingById(
      req.params.id,
    );
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "Chiller reading not found" });
    }

    const reading = await chillerReadingsService.updateChillerReading(
      req.params.id,
      req.body,
    );
    res.json({ success: true, data: reading });
  } catch (error) {
    console.error("Update chiller reading error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const existing = await chillerReadingsService.getChillerReadingById(
      req.params.id,
    );
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "Chiller reading not found" });
    }

    await chillerReadingsService.deleteChillerReading(req.params.id);
    res.json({
      success: true,
      message: "Chiller reading deleted successfully",
    });
  } catch (error) {
    console.error("Delete chiller reading error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAverages = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({
        success: false,
        error: "date_from and date_to are required",
      });
    }

    const averages = await chillerReadingsService.getChillerAverages(
      req.params.chillerId,
      date_from,
      date_to,
    );
    res.json({ success: true, data: averages });
  } catch (error) {
    console.error("Get averages error:", error);
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
  getByChiller,
  getLatest,
  getByDateShift,
  update,
  remove,
  getAverages,
};
