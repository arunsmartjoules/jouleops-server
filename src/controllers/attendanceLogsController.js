import attendanceLogsService from "../services/attendanceLogsService.js";
import { validateAttendanceLog } from "../models/attendanceLogModel.js";

/**
 * Attendance Logs Controller
 */

export const create = async (req, res) => {
  try {
    const validation = validateAttendanceLog(req.body);
    if (!validation.isValid) {
      return res
        .status(400)
        .json({ success: false, errors: validation.errors });
    }

    const log = await attendanceLogsService.createAttendanceLog(req.body);
    res.status(201).json({ success: true, data: log });
  } catch (error) {
    console.error("Create attendance log error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const checkIn = async (req, res) => {
  try {
    let { user_id } = req.body;
    const { site_id, latitude, longitude, address, shift_id } = req.body;

    // Force user_id from token unless admin
    const user = req.user;
    const isAdmin =
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.is_superadmin === true;

    if (!isAdmin || !user_id) {
      user_id = user.user_id || user.id;
    }

    if (!user_id || !site_id) {
      return res.status(400).json({
        success: false,
        error: "user_id and site_id are required",
      });
    }

    // Check if already checked in today
    const existing = await attendanceLogsService.getTodayAttendance(user_id);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: "Already checked in today",
        data: existing,
      });
    }

    // Validate location if coordinates are provided
    if (latitude && longitude) {
      const locationValidation =
        await attendanceLogsService.validateUserLocation(
          user_id,
          parseFloat(latitude),
          parseFloat(longitude),
        );

      // For non-WFH users, verify the selected site is in allowed sites
      if (!locationValidation.isWFH) {
        const isValidSite = locationValidation.allowedSites.some(
          (s) => s.site_id === site_id,
        );
        if (!isValidSite) {
          return res.status(400).json({
            success: false,
            error:
              locationValidation.message ||
              "You are not within range of the selected site",
            allowedSites: locationValidation.allowedSites,
            nearestSite: locationValidation.nearestSite,
          });
        }
      }
    }

    // Prepare data for insertion
    // If site_id is "WFH", pass null
    const siteIdForDb = site_id === "WFH" ? null : site_id;

    const log = await attendanceLogsService.checkIn({
      user_id,
      site_id: siteIdForDb,
      latitude,
      longitude,
      address,
      shift_id,
    });
    res
      .status(201)
      .json({ success: true, message: "Checked in successfully", data: log });
  } catch (error) {
    console.error("Check in error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const checkOut = async (req, res) => {
  try {
    const { latitude, longitude, address, remarks } = req.body;

    // Get existing attendance record to check for early checkout
    const existing = await attendanceLogsService.getAttendanceById(
      req.params.id,
    );
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Attendance record not found",
      });
    }

    // Enforce ownership
    const user = req.user;
    const isAdmin =
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.is_superadmin === true;

    // Ensure existing.user_id matches token user_id
    if (!isAdmin && existing.user_id !== (user.user_id || user.id)) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized to check out for this user",
      });
    }

    // Calculate hours worked
    const checkInTime = new Date(existing.check_in_time);
    const checkOutTime = new Date();
    const hoursWorked = (checkOutTime - checkInTime) / (1000 * 60 * 60);

    // If early checkout (less than 7 hours), require remarks
    if (hoursWorked < 7 && !remarks) {
      return res.status(400).json({
        success: false,
        error: "Early checkout requires a reason",
        isEarlyCheckout: true,
        hoursWorked: hoursWorked.toFixed(2),
      });
    }

    const log = await attendanceLogsService.checkOut(req.params.id, {
      latitude,
      longitude,
      address,
      remarks,
    });
    res.json({
      success: true,
      message: "Checked out successfully",
      data: log,
      hoursWorked: hoursWorked.toFixed(2),
      isEarlyCheckout: hoursWorked < 7,
    });
  } catch (error) {
    console.error("Check out error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const validateLocation = async (req, res) => {
  try {
    const { userId } = req.params;
    const { latitude, longitude } = req.query;

    // Ownership check
    const user = req.user;
    const isAdmin =
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.is_superadmin === true;

    if (!isAdmin && userId !== (user.user_id || user.id)) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized",
      });
    }

    // We allow missing lat/long to support checking WFH status first.
    // The service will handle the validation logic.

    const result = await attendanceLogsService.validateUserLocation(
      userId,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
    );

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("Validate location error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getUserSites = async (req, res) => {
  try {
    const { userId } = req.params;

    // Ownership check
    const user = req.user;
    const isAdmin =
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.is_superadmin === true;

    if (!isAdmin && userId !== (user.user_id || user.id)) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const sites =
      await attendanceLogsService.getUserSitesWithCoordinates(userId);
    res.json({ success: true, data: sites });
  } catch (error) {
    console.error("Get user sites error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getById = async (req, res) => {
  try {
    const log = await attendanceLogsService.getAttendanceById(req.params.id);
    if (!log) {
      return res
        .status(404)
        .json({ success: false, error: "Attendance log not found" });
    }

    // Ownership check
    const user = req.user;
    const isAdmin =
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.is_superadmin === true;

    if (!isAdmin && log.user_id !== (user.user_id || user.id)) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized",
      });
    }

    res.json({ success: true, data: log });
  } catch (error) {
    console.error("Get attendance log error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getTodayByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    // Ownership check
    const user = req.user;
    const isAdmin =
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.is_superadmin === true;

    if (!isAdmin && userId !== (user.user_id || user.id)) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const log = await attendanceLogsService.getTodayAttendance(userId);
    res.json({ success: true, data: log });
  } catch (error) {
    console.error("Get today attendance error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    // Ownership check
    const user = req.user;
    const isAdmin =
      user.role === "admin" ||
      user.role === "superadmin" ||
      user.is_superadmin === true;

    if (!isAdmin && userId !== (user.user_id || user.id)) {
      return res.status(403).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const { page, limit, date_from, date_to } = req.query;
    const result = await attendanceLogsService.getAttendanceByUser(userId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 30,
      date_from,
      date_to,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("Get attendance error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getBySite = async (req, res) => {
  try {
    const { date, status } = req.query;
    const logs = await attendanceLogsService.getAttendanceBySite(
      req.params.siteId,
      {
        date,
        status,
      },
    );
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error("Get attendance error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getReport = async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({
        success: false,
        error: "date_from and date_to are required",
      });
    }

    const report = await attendanceLogsService.getAttendanceReport(
      req.params.siteId,
      date_from,
      date_to,
    );
    res.json({ success: true, data: report });
  } catch (error) {
    console.error("Get attendance report error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getOverallReport = async (req, res) => {
  try {
    const { date_from, date_to, site_id } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({
        success: false,
        error: "date_from and date_to are required",
      });
    }

    const report = await attendanceLogsService.getAttendanceReport(
      site_id || "all",
      date_from,
      date_to,
    );
    res.json({ success: true, data: report });
  } catch (error) {
    console.error("Get overall attendance report error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const update = async (req, res) => {
  try {
    const existing = await attendanceLogsService.getAttendanceById(
      req.params.id,
    );
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "Attendance log not found" });
    }

    const log = await attendanceLogsService.updateAttendanceLog(
      req.params.id,
      req.body,
    );
    res.json({ success: true, data: log });
  } catch (error) {
    console.error("Update attendance log error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const remove = async (req, res) => {
  try {
    const existing = await attendanceLogsService.getAttendanceById(
      req.params.id,
    );
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, error: "Attendance log not found" });
    }

    await attendanceLogsService.deleteAttendanceLog(req.params.id);
    res.json({ success: true, message: "Attendance log deleted successfully" });
  } catch (error) {
    console.error("Delete attendance log error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export default {
  create,
  checkIn,
  checkOut,
  getById,
  getTodayByUser,
  getByUser,
  getBySite,
  getReport,
  getOverallReport,
  update,
  remove,
  validateLocation,
  getUserSites,
};
