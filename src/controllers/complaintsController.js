import complaintsService from "../services/complaintsService.js";
import { validateComplaint, VALID_STATUSES } from "../models/complaintModel.js";

/**
 * Complaints Controller
 * Handles HTTP requests and responses
 */

// POST /api/complaints - Create new complaint
export const create = async (req, res) => {
  try {
    // Validate input
    const validation = validateComplaint(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        errors: validation.errors,
      });
    }

    // Create complaint
    const complaint = await complaintsService.createComplaint(req.body);

    res.status(201).json({
      success: true,
      message: "Complaint created successfully",
      data: complaint,
    });
  } catch (error) {
    console.error("Create complaint error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/complaints/:ticketId - Get complaint by ID
export const getById = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const complaint = await complaintsService.getComplaintById(ticketId);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        error: "Complaint not found",
      });
    }

    res.json({
      success: true,
      data: complaint,
    });
  } catch (error) {
    console.error("Get complaint error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/complaints/site/:siteId - Get complaints by site
export const getBySite = async (req, res) => {
  try {
    const { siteId } = req.params;
    const {
      page,
      limit,
      status,
      category,
      fromDate,
      toDate,
      sortBy,
      sortOrder,
    } = req.query;

    const result = await complaintsService.getComplaintsBySite(siteId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      category,
      fromDate,
      toDate,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Get complaints error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/complaints/group/:groupId/recent - Get recent complaints by group
export const getRecentByGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { limit } = req.query;

    const complaints = await complaintsService.getRecentComplaintsByGroup(
      groupId,
      parseInt(limit) || 5,
    );

    res.json({
      success: true,
      data: complaints,
    });
  } catch (error) {
    console.error("Get recent complaints error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/complaints/message/:messageId - Get complaint by message ID
export const getByMessageId = async (req, res) => {
  try {
    const { messageId } = req.params;

    const complaint =
      await complaintsService.getComplaintByMessageId(messageId);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        error: "Complaint not found",
      });
    }

    res.json({
      success: true,
      data: complaint,
    });
  } catch (error) {
    console.error("Get complaint error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// PUT /api/complaints/:ticketId - Update complaint
export const update = async (req, res) => {
  try {
    const { ticketId } = req.params;

    // Check if complaint exists
    const existing = await complaintsService.getComplaintById(ticketId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Complaint not found",
      });
    }

    // Update complaint
    const complaint = await complaintsService.updateComplaint(
      ticketId,
      req.body,
      {
        name: req.user?.full_name || req.user?.name,
        email: req.user?.email,
        userId: req.user?.user_id,
      },
    );

    res.json({
      success: true,
      message: "Complaint updated successfully",
      data: complaint,
    });
  } catch (error) {
    console.error("Update complaint error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// PATCH /api/complaints/:ticketId/status - Update complaint status
export const updateStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, remarks } = req.body;

    // Validate status
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
      });
    }

    // Check if complaint exists
    const existing = await complaintsService.getComplaintById(ticketId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Complaint not found",
      });
    }

    // Enforce workflow rules
    if (status === "Resolved") {
      if (existing.status !== "Inprogress") {
        return res.status(400).json({
          success: false,
          error: "Only tickets in 'Inprogress' status can be resolved.",
        });
      }
      if (!remarks || remarks.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "Resolution message is required when resolving a ticket.",
        });
      }
    }

    if (status === "Cancelled" && (!remarks || remarks.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        error: "Reason is required when cancelling a ticket.",
      });
    }

    // Update status
    const complaint = await complaintsService.updateComplaintStatus(
      ticketId,
      status,
      remarks,
      {
        name: req.user?.full_name || req.user?.name,
        email: req.user?.email,
        userId: req.user?.user_id,
      },
    );

    res.json({
      success: true,
      message: "Status updated successfully",
      data: complaint,
    });
  } catch (error) {
    console.error("Update status error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// DELETE /api/complaints/:ticketId - Delete complaint
export const remove = async (req, res) => {
  try {
    const { ticketId } = req.params;

    // Check if complaint exists
    const existing = await complaintsService.getComplaintById(ticketId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Complaint not found",
      });
    }

    await complaintsService.deleteComplaint(ticketId);

    res.json({
      success: true,
      message: "Complaint deleted successfully",
    });
  } catch (error) {
    console.error("Delete complaint error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// GET /api/complaints/site/:siteId/stats - Get complaint statistics
export const getStats = async (req, res) => {
  try {
    const { siteId } = req.params;

    const stats = await complaintsService.getComplaintStats(siteId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Get stats error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
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
  getRecentByGroup,
  getByMessageId,
  update,
  updateStatus,
  remove,
  getStats,
};
