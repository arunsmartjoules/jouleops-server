/**
 * Complaints Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import complaintsRepository from "../repositories/complaintsRepository.ts";
import {
  forwardComplaintToFieldproxy,
  updateComplaintInFieldproxy,
} from "../services/fieldproxyService.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
  logActivity,
  type AuthRequest,
} from "@jouleops/shared";

const VALID_STATUSES = ["Open", "Inprogress", "Resolved", "Cancelled"];

export const create = async (req: Request, res: Response) => {
  try {
    const { site_code } = req.body;
    if (!site_code) {
      return sendError(res, "site_code is required");
    }

    // Auto-generate ticket number
    const ticket_no = await complaintsRepository.generateTicketNo(site_code);

    const complaint = await complaintsRepository.createComplaint({
      ...req.body,
      ticket_no,
    });

    // Forward to Fieldproxy — fire and forget, do not block the response
    forwardComplaintToFieldproxy(complaint)
      .then((fpResponse) => {
        logActivity({
          action: "FORWARD_TO_FIELDPROXY",
          module: "complaints",
          description: `Complaint ${complaint.ticket_no} forwarded to Fieldproxy successfully`,
          metadata: {
            ticket_no: complaint.ticket_no,
            site_code: complaint.site_code,
            fieldproxy_response: fpResponse,
          },
        }).catch(() => {});
      })
      .catch((err: Error) => {
        console.error("Fieldproxy forward failed:", err);
        logActivity({
          action: "FORWARD_TO_FIELDPROXY_FAILED",
          module: "complaints",
          description: `Failed to forward complaint ${complaint.ticket_no} to Fieldproxy: ${err.message}`,
          metadata: {
            ticket_no: complaint.ticket_no,
            site_code: complaint.site_code,
            error: err.message,
          },
        }).catch(() => {});
      });

    logActivity({
      user_id: (req as AuthRequest).user?.user_id,
      action: "CREATE_COMPLAINT",
      module: "complaints",
      description: `Complaint ${complaint.ticket_no} created for site ${complaint.site_code}`,
      ip_address: req.ip,
      metadata: {
        ticket_no: complaint.ticket_no,
        site_code: complaint.site_code,
        title: complaint.title,
        category: complaint.category,
        priority: complaint.priority,
      },
    }).catch(() => {});

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
    const { siteCode } = req.params as { siteCode: string };
    const {
      page,
      limit,
      status,
      category,
      fromDate,
      toDate,
      sortBy,
      sortOrder,
      search,
      filters,
      message_id,
      group_id,
      ticket_no,
      id,
    } = req.query;

    const result = await complaintsRepository.getComplaintsBySite(siteCode, {
      page: page as string,
      limit: limit as string,
      status: status as string,
      category: category as string,
      fromDate: fromDate as string,
      toDate: toDate as string,
      sortBy: sortBy as string,
      sortOrder: sortOrder as "asc" | "desc",
      search: search as string,
      filters: (filters || []) as any,
      message_id: message_id as string,
      group_id: group_id as string,
      ticket_no: ticket_no as string,
      id: id as string,
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
    const id = (req.params.id || req.query.id) as string;

    if (!id) {
      return sendError(
        res,
        "A ticket identifier (id or ticket_no) is required",
      );
    }

    const existing = await complaintsRepository.getComplaint(id);
    if (!existing) {
      return sendNotFound(res, "Complaint");
    }

    const complaint = await complaintsRepository.updateComplaint(
      existing.id,
      req.body,
    );

    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_COMPLAINT",
      module: "complaints",
      description: `Complaint ${existing.ticket_no} updated`,
      ip_address: req.ip,
      metadata: {
        ticket_no: existing.ticket_no,
        updated_fields: Object.keys(req.body),
      },
    }).catch(() => {});

    // Sync with Fieldproxy — fire and forget
    updateComplaintInFieldproxy(existing.ticket_no, req.body)
      .then((fpResponse) => {
        logActivity({
          action: "UPDATE_FIELDPROXY",
          module: "complaints",
          description: `Complaint ${existing.ticket_no} updated in Fieldproxy successfully`,
          metadata: {
            ticket_no: existing.ticket_no,
            fieldproxy_response: fpResponse,
          },
        }).catch(() => {});
      })
      .catch((err: Error) => {
        console.error("Fieldproxy update failed:", err);
        logActivity({
          action: "UPDATE_FIELDPROXY_FAILED",
          module: "complaints",
          description: `Failed to update complaint ${existing.ticket_no} in Fieldproxy: ${err.message}`,
          metadata: { ticket_no: existing.ticket_no, error: err.message },
        }).catch(() => {});
      });

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
    const id = (req.params.id || req.query.id) as string;

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id || "",
      );

    if (!id || !isUuid) {
      return sendError(res, "A valid ticket UUID (id) is required");
    }

    const { status, remarks } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return sendError(
        res,
        `status must be one of: ${VALID_STATUSES.join(", ")}`,
      );
    }

    const existing = await complaintsRepository.getComplaintById(id);
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

    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_COMPLAINT_STATUS",
      module: "complaints",
      description: `Complaint ${existing.ticket_no} status changed from ${existing.status} to ${status}`,
      ip_address: req.ip,
      metadata: {
        ticket_no: existing.ticket_no,
        old_status: existing.status,
        new_status: status,
        remarks: remarks || null,
      },
    }).catch(() => {});

    // Sync with Fieldproxy — fire and forget
    updateComplaintInFieldproxy(existing.ticket_no, { status })
      .then((fpResponse) => {
        logActivity({
          action: "UPDATE_FIELDPROXY",
          module: "complaints",
          description: `Complaint ${existing.ticket_no} status updated to ${status} in Fieldproxy successfully`,
          metadata: {
            ticket_no: existing.ticket_no,
            status,
            fieldproxy_response: fpResponse,
          },
        }).catch(() => {});
      })
      .catch((err: Error) => {
        console.error("Fieldproxy status update failed:", err);
        logActivity({
          action: "UPDATE_FIELDPROXY_FAILED",
          module: "complaints",
          description: `Failed to update status for ${existing.ticket_no} in Fieldproxy: ${err.message}`,
          metadata: {
            ticket_no: existing.ticket_no,
            status,
            error: err.message,
          },
        }).catch(() => {});
      });

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

    logActivity({
      user_id: (req as AuthRequest).user?.user_id,
      action: "DELETE_COMPLAINT",
      module: "complaints",
      description: `Complaint ${existing.ticket_no} deleted`,
      ip_address: req.ip,
      metadata: {
        ticket_no: existing.ticket_no,
        site_code: existing.site_code,
      },
    }).catch(() => {});

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
    const { siteCode } = req.params as { siteCode: string };
    const stats = await complaintsRepository.getComplaintStats(siteCode);

    return sendSuccess(res, stats);
  } catch (error: any) {
    console.error("Get stats error:", error);
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  req.params.siteCode = "all";
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
