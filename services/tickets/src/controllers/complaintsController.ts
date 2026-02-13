/**
 * Complaints Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import complaintsRepository from "../repositories/complaintsRepository.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
} from "@smartops/shared";

const VALID_STATUSES = ["Open", "Inprogress", "Resolved", "Cancelled"];

interface AuthRequest extends Request {
  user?: {
    user_id: string;
    full_name?: string;
    name?: string;
    email?: string;
  };
}

export const create = async (req: Request, res: Response) => {
  try {
    const complaint = await complaintsRepository.createComplaint(req.body);
    return sendCreated(res, complaint, "Complaint created successfully");
  } catch (error: any) {
    console.error("Create complaint error:", error);
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params as { ticketId: string };
    const complaint = await complaintsRepository.getComplaint(ticketId);

    if (!complaint) {
      return sendNotFound(res, "Complaint");
    }

    return sendSuccess(res, complaint);
  } catch (error: any) {
    console.error("Get complaint error:", error);
    return sendServerError(res, error);
  }
};

export const getBySite = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params as { siteId: string };
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

    const result = await complaintsRepository.getComplaintsBySite(siteId, {
      page: parseInt(page as string) || 1,
      limit: parseInt(limit as string) || 20,
      status: status as string | undefined,
      category: category as string | undefined,
      fromDate: fromDate as string | undefined,
      toDate: toDate as string | undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
    });

    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get complaints error:", error);
    return sendServerError(res, error);
  }
};

export const getRecentByGroup = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params as { groupId: string };
    const { limit } = req.query;

    const complaints = await complaintsRepository.getRecentComplaintsByGroup(
      groupId,
      parseInt(limit as string) || 5,
    );

    return sendSuccess(res, complaints);
  } catch (error: any) {
    console.error("Get recent complaints error:", error);
    return sendServerError(res, error);
  }
};

export const getByMessageId = async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params as { messageId: string };
    const complaint =
      await complaintsRepository.getComplaintByMessageId(messageId);

    if (!complaint) {
      return sendNotFound(res, "Complaint");
    }

    return sendSuccess(res, complaint);
  } catch (error: any) {
    console.error("Get complaint error:", error);
    return sendServerError(res, error);
  }
};

export const update = async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId } = req.params as { ticketId: string };

    const existing = await complaintsRepository.getComplaint(ticketId);
    if (!existing) {
      return sendNotFound(res, "Complaint");
    }

    const complaint = await complaintsRepository.updateComplaint(
      existing.id,
      req.body,
    );

    return sendSuccess(res, complaint, {
      message: "Complaint updated successfully",
    });
  } catch (error: any) {
    console.error("Update complaint error:", error);
    return sendServerError(res, error);
  }
};

export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { ticketId } = req.params as { ticketId: string };
    const { status, remarks } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return sendError(
        res,
        `status must be one of: ${VALID_STATUSES.join(", ")}`,
      );
    }

    const existing = await complaintsRepository.getComplaint(ticketId);
    if (!existing) {
      return sendNotFound(res, "Complaint");
    }

    // Enforce workflow rules
    if (status === "Resolved") {
      if (existing.status !== "Inprogress") {
        return sendError(
          res,
          "Only tickets in 'Inprogress' status can be resolved.",
        );
      }
      if (!remarks || remarks.trim().length === 0) {
        return sendError(
          res,
          "Resolution message is required when resolving a ticket.",
        );
      }
    }

    if (status === "Cancelled" && (!remarks || remarks.trim().length === 0)) {
      return sendError(res, "Reason is required when cancelling a ticket.");
    }

    const complaint = await complaintsRepository.updateComplaintStatus(
      existing.id,
      status,
      remarks,
    );

    return sendSuccess(res, complaint, {
      message: "Status updated successfully",
    });
  } catch (error: any) {
    console.error("Update status error:", error);
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params as { ticketId: string };

    const existing = await complaintsRepository.getComplaint(ticketId);
    if (!existing) {
      return sendNotFound(res, "Complaint");
    }

    await complaintsRepository.deleteComplaint(ticketId);

    return sendSuccess(res, null, {
      message: "Complaint deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete complaint error:", error);
    return sendServerError(res, error);
  }
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const { siteId } = req.params as { siteId: string };
    const stats = await complaintsRepository.getComplaintStats(siteId);

    return sendSuccess(res, stats);
  } catch (error: any) {
    console.error("Get stats error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
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
