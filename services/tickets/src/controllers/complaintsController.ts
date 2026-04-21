/**
 * Complaints Controller
 *
 * Uses direct PostgreSQL via repositories.
 * Standardized API responses via apiResponse helpers.
 */

import complaintsRepository from "../repositories/complaintsRepository.ts";
import incidentsRepository, {
  type IncidentRcaStatus,
} from "../repositories/incidentsRepository.ts";
import { sendIncidentEventNotifications } from "../services/notificationService.ts";
import {
  forwardComplaintToFieldproxy,
  updateComplaintInFieldproxy,
} from "../services/fieldproxyService.ts";
import { sendTicketCreatedNotifications } from "../services/notificationService.ts";
import type { Request, Response } from "express";
import {
  sendSuccess,
  sendCreated,
  sendError,
  sendNotFound,
  sendServerError,
  logActivity,
  asyncHandler,
  type AuthRequest,
} from "@jouleops/shared";

const VALID_STATUSES = ["Open", "Inprogress", "Resolved", "Cancelled"];

const toIsoString = (value?: Date | string | null) => {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const buildFieldproxyUpdatePayload = (complaint: any) => ({
  title: complaint.title,
  status: complaint.status,
  area_asset: complaint.area_asset,
  location: complaint.location,
  category: complaint.category,
  internal_remarks: complaint.internal_remarks,
  assigned_to: complaint.assigned_to,
  responded_at: toIsoString(complaint.responded_at),
  resolved_at: toIsoString(complaint.resolved_at),
  before_temp: complaint.before_temp ?? undefined,
  after_temp: complaint.after_temp ?? undefined,
});

const buildFieldproxyForwardPayload = (complaint: any) => ({
  site_code: complaint.site_code,
  title: complaint.title,
  location: complaint.location,
  area_asset: complaint.area_asset,
  category: complaint.category,
  status: complaint.status,
  sender_id: complaint.sender_id,
  message_id: complaint.message_id,
  group_id: complaint.group_id,
  ticket_no: complaint.ticket_no,
  created_user: complaint.created_user,
});

type ManualFieldproxySyncResult = {
  ticket_no: string;
  action: "updated" | "created" | "failed";
  message?: string;
  error?: string;
};

const syncComplaintToFieldproxyUpsert = async (
  complaint: any,
): Promise<ManualFieldproxySyncResult> => {
  try {
    const updateResult = await updateComplaintInFieldproxy(
      complaint.ticket_no,
      buildFieldproxyUpdatePayload(complaint),
    );

    if (updateResult.update) {
      return {
        ticket_no: complaint.ticket_no,
        action: "updated",
        message: "Updated existing Fieldproxy row",
      };
    }

    if (updateResult.error?.toLowerCase().includes("row not found")) {
      await forwardComplaintToFieldproxy(buildFieldproxyForwardPayload(complaint));
      return {
        ticket_no: complaint.ticket_no,
        action: "created",
        message: "Created new Fieldproxy row",
      };
    }

    return {
      ticket_no: complaint.ticket_no,
      action: "failed",
      error: updateResult.error || "Unknown Fieldproxy update error",
    };
  } catch (error: any) {
    return {
      ticket_no: complaint.ticket_no,
      action: "failed",
      error: error.message || "Failed to sync complaint to Fieldproxy",
    };
  }
};

export const create = async (req: AuthRequest, res: Response) => {
  try {
    const { site_code, sender_id, created_user } = req.body;
    if (!site_code) {
      return sendError(res, "site_code is required");
    }

    // Auto-generate ticket number
    const ticket_no = await complaintsRepository.generateTicketNo(site_code);

    // Populate user info if available from auth
    const userId = req.user?.user_id;
    const finalData = {
      ...req.body,
      ticket_no,
      created_user: created_user || userId,
      sender_id: sender_id || userId,
    };

    const complaint = await complaintsRepository.createComplaint(finalData);

    // Trace: Local persistence success
    logActivity({
      action: "TICKET_CREATION_TRACE",
      module: "complaints",
      description: `Persisted complaint ${complaint.ticket_no} to local database`,
      metadata: { ticket_no: complaint.ticket_no, site_code: complaint.site_code },
    }).catch(() => {});

    // Send push notifications to site users — fire and forget
    sendTicketCreatedNotifications(complaint).catch(() => {});

    // Forward to Fieldproxy — fire and forget, do not block the response
    forwardComplaintToFieldproxy(buildFieldproxyForwardPayload(complaint))
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
    logActivity({
      user_id: (req as AuthRequest).user?.user_id,
      action: "CREATE_COMPLAINT_ERROR",
      module: "complaints",
      description: `Failed to create complaint: ${error.message}`,
      ip_address: req.ip,
      metadata: { error: error.message, body: req.body },
    }).catch(() => {});
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const complaint = await complaintsRepository.getComplaint(id);

    if (!complaint) {
      return sendNotFound(res, "Complaint");
    }

    return sendSuccess(res, complaint);
  } catch (error: any) {
    console.error("Get complaint error:", error);
    logActivity({
      user_id: (req as AuthRequest).user?.user_id,
      action: "GET_COMPLAINT_ERROR",
      module: "complaints",
      description: `Failed to fetch complaint ${req.params.id}: ${error.message}`,
      ip_address: req.ip,
      metadata: { error: error.message, id: req.params.id },
    }).catch(() => {});
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
      priority,
    } = req.query;

    let statusFilter = status as string | undefined;
    let categoryFilter = category as string | undefined;
    let fromDateFilter = fromDate as string | undefined;
    let toDateFilter = toDate as string | undefined;
    let priorityFilter = priority as string | undefined;

    if (filters) {
      try {
        const parsedFilters =
          typeof filters === "string" ? JSON.parse(filters) : filters;
        if (Array.isArray(parsedFilters)) {
          const statusRule = parsedFilters.find((f: any) => f.fieldId === "status");
          if (statusRule) statusFilter = statusRule.value;

          const catRule = parsedFilters.find((f: any) => f.fieldId === "category");
          if (catRule) categoryFilter = catRule.value;

          const fromRule = parsedFilters.find(
            (f: any) => f.fieldId === "fromDate" || f.fieldId === "date_from",
          );
          if (fromRule) fromDateFilter = fromRule.value;

          const toRule = parsedFilters.find(
            (f: any) => f.fieldId === "toDate" || f.fieldId === "date_to",
          );
          if (toRule) toDateFilter = toRule.value;

          const prioRule = parsedFilters.find((f: any) => f.fieldId === "priority");
          if (prioRule) priorityFilter = prioRule.value;
        }
      } catch (e) {
        console.error("[COMPLAINTS_CONTROLLER] Error parsing filters:", e);
      }
    }

    const result = await complaintsRepository.getComplaintsBySite(siteCode, {
      page: page as string,
      limit: limit as string,
      status: statusFilter,
      category: categoryFilter,
      fromDate: fromDateFilter,
      toDate: toDateFilter,
      sortBy: sortBy as string,
      sortOrder: sortOrder as "asc" | "desc" | undefined,
      search: search as string,
      filters: filters as any,
      message_id: message_id as string,
      group_id: group_id as string,
      ticket_no: ticket_no as string,
      id: id as string,
      priority: priorityFilter,
    });

    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    console.error("Get complaints error:", error);
    logActivity({
      user_id: (req as AuthRequest).user?.user_id,
      action: "GET_COMPLAINTS_BY_SITE_ERROR",
      module: "complaints",
      description: `Failed to fetch complaints for site ${req.params.siteCode}: ${error.message}`,
      ip_address: req.ip,
      metadata: {
        error: error.message,
        siteCode: req.params.siteCode,
        query: req.query,
      },
    }).catch(() => {});
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
    logActivity({
      user_id: (req as AuthRequest).user?.user_id,
      action: "GET_RECENT_COMPLAINTS_ERROR",
      module: "complaints",
      description: `Failed to fetch recent complaints for group ${req.params.groupId}: ${error.message}`,
      ip_address: req.ip,
      metadata: { error: error.message, groupId: req.params.groupId },
    }).catch(() => {});
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
    logActivity({
      user_id: (req as AuthRequest).user?.user_id,
      action: "GET_COMPLAINT_BY_MESSAGE_ERROR",
      module: "complaints",
      description: `Failed to fetch complaint by messageId ${req.params.messageId}: ${error.message}`,
      ip_address: req.ip,
      metadata: { error: error.message, messageId: req.params.messageId },
    }).catch(() => {});
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

    const { create_incident, incident_payload, ...complaintUpdateBody } = req.body as Record<
      string,
      unknown
    > & {
      create_incident?: boolean;
      incident_payload?: Record<string, unknown>;
    };

    const complaint = await complaintsRepository.updateComplaint(
      existing.id,
      complaintUpdateBody as Parameters<typeof complaintsRepository.updateComplaint>[1],
    );

    if (create_incident === true) {
      const payload = incident_payload || {};
      const rcaRaw = payload.rca_status;
      const allowedRca: IncidentRcaStatus[] = ["Open", "RCA Under Review", "RCA Submitted"];
      const rca_status: IncidentRcaStatus =
        typeof rcaRaw === "string" && allowedRca.includes(rcaRaw as IncidentRcaStatus)
          ? (rcaRaw as IncidentRcaStatus)
          : "Open";

      const clientRequestId =
        typeof payload.client_request_id === "string" && /^[0-9a-f-]{36}$/i.test(payload.client_request_id)
          ? payload.client_request_id
          : undefined;

      const incident = await incidentsRepository.createIncident({
        source: "Tickets",
        ticket_id: existing.id,
        site_code: existing.site_code,
        asset_location: (payload.asset_location as string | undefined) || complaint.area_asset || null,
        raised_by: req.user?.user_id || complaint.created_user || null,
        fault_symptom: (payload.fault_symptom as string | undefined) || complaint.title,
        fault_type: (payload.fault_type as string | undefined) || "Others",
        severity: (payload.severity as string | undefined) || "Moderate",
        operating_condition: (payload.operating_condition as string | undefined) || null,
        immediate_action_taken:
          (payload.immediate_action_taken as string | undefined) || complaint.internal_remarks || null,
        attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
        remarks: (payload.remarks as string | undefined) || complaint.internal_remarks || null,
        status: "Inprogress",
        incident_updated_time: new Date(),
        rca_status,
        assigned_to: (payload.assigned_to as string[] | undefined) || [],
        ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
      });
      sendIncidentEventNotifications("incident_created", incident as any).catch(() => {});
    }

    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_COMPLAINT",
      module: "complaints",
      description: `Complaint ${existing.ticket_no} updated`,
      ip_address: req.ip,
      metadata: {
        ticket_no: existing.ticket_no,
        updated_fields: Object.keys(req.body),
        status: complaint.status,
        before_temp: complaint.before_temp ?? null,
        after_temp: complaint.after_temp ?? null,
        responded_at: complaint.responded_at ?? null,
        resolved_at: complaint.resolved_at ?? null,
      },
    }).catch(() => {});

    // Sync with Fieldproxy — fire and forget
    updateComplaintInFieldproxy(
      existing.ticket_no,
      buildFieldproxyUpdatePayload(complaint),
    )
      .then((syncResult) => {
        // Log Lookup
        logActivity({
          action: "LOOKUP_FIELDPROXY",
          module: "complaints",
          description: `Fieldproxy lookup for complaint ${existing.ticket_no}`,
          metadata: {
            ticket_no: existing.ticket_no,
            fieldproxy_response: syncResult.lookup,
          },
        }).catch(() => {});

        // Log Update result
        if (syncResult.update) {
          logActivity({
            action: "UPDATE_FIELDPROXY",
            module: "complaints",
            description: `Complaint ${existing.ticket_no} updated in Fieldproxy successfully`,
            metadata: {
              ticket_no: existing.ticket_no,
              status: complaint.status,
              before_temp: complaint.before_temp ?? null,
              after_temp: complaint.after_temp ?? null,
              responded_at: complaint.responded_at ?? null,
              resolved_at: complaint.resolved_at ?? null,
              fieldproxy_response: syncResult.update,
            },
          }).catch(() => {});
        } else if (syncResult.error) {
          logActivity({
            action: "UPDATE_FIELDPROXY_FAILED",
            module: "complaints",
            description: `Fieldproxy update for ${existing.ticket_no} skipped: ${syncResult.error}`,
            metadata: {
              ticket_no: existing.ticket_no,
              error: syncResult.error,
              lookup_response: syncResult.lookup,
            },
          }).catch(() => {});
        }
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
    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_COMPLAINT_ERROR",
      module: "complaints",
      description: `Failed to update complaint: ${error.message}`,
      ip_address: req.ip,
      metadata: { error: error.message, id: req.params.id || req.query.id },
    }).catch(() => {});
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
      status === "Inprogress" || status === "Cancelled"
        ? req.user?.user_id
        : undefined,
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
        before_temp: complaint.before_temp ?? null,
        after_temp: complaint.after_temp ?? null,
        responded_at: complaint.responded_at ?? null,
        resolved_at: complaint.resolved_at ?? null,
      },
    }).catch(() => {});

    // Sync with Fieldproxy — fire and forget
    updateComplaintInFieldproxy(
      existing.ticket_no,
      buildFieldproxyUpdatePayload(complaint),
    )
      .then((syncResult) => {
        // Log Lookup
        logActivity({
          action: "LOOKUP_FIELDPROXY",
          module: "complaints",
          description: `Fieldproxy lookup for complaint ${existing.ticket_no}`,
          metadata: {
            ticket_no: existing.ticket_no,
            fieldproxy_response: syncResult.lookup,
          },
        }).catch(() => {});

        // Log Update result
        if (syncResult.update) {
          logActivity({
            action: "UPDATE_FIELDPROXY",
            module: "complaints",
            description: `Complaint ${existing.ticket_no} status updated to ${status} in Fieldproxy successfully`,
            metadata: {
              ticket_no: existing.ticket_no,
              status: complaint.status,
              before_temp: complaint.before_temp ?? null,
              after_temp: complaint.after_temp ?? null,
              responded_at: complaint.responded_at ?? null,
              resolved_at: complaint.resolved_at ?? null,
              fieldproxy_response: syncResult.update,
            },
          }).catch(() => {});
        } else if (syncResult.error) {
          logActivity({
            action: "UPDATE_FIELDPROXY_FAILED",
            module: "complaints",
            description: `Fieldproxy update for ${existing.ticket_no} skipped: ${syncResult.error}`,
            metadata: {
              ticket_no: existing.ticket_no,
              status,
              error: syncResult.error,
              lookup_response: syncResult.lookup,
            },
          }).catch(() => {});
        }
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
    logActivity({
      user_id: req.user?.user_id,
      action: "UPDATE_COMPLAINT_STATUS_ERROR",
      module: "complaints",
      description: `Failed to update status for complaint: ${error.message}`,
      ip_address: req.ip,
      metadata: { error: error.message, id: req.params.id || req.query.id },
    }).catch(() => {});
    return sendServerError(res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const ticketNo = id; // Maintain clarity that this could be a ticket number

    const existing = await complaintsRepository.getComplaint(ticketNo);
    if (!existing) {
      return sendNotFound(res, "Complaint");
    }

    await complaintsRepository.deleteComplaint(ticketNo);

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
    logActivity({
      user_id: (req as AuthRequest).user?.user_id,
      action: "DELETE_COMPLAINT_ERROR",
      module: "complaints",
      description: `Failed to delete complaint ${req.params.id}: ${error.message}`,
      ip_address: req.ip,
      metadata: { error: error.message, id: req.params.id },
    }).catch(() => {});
    return sendServerError(res, error);
  }
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const { siteCode } = req.params as { siteCode: string };
    const { fromDate, toDate, search, priority } = req.query;

    const stats = await complaintsRepository.getComplaintStats(siteCode, {
      fromDate: (fromDate as string) || null,
      toDate: (toDate as string) || null,
      search: (search as string) || null,
      priority: (priority as string) || null,
    });

    return sendSuccess(res, stats);
  } catch (error: any) {
    console.error("Get stats error:", error);
    logActivity({
      user_id: (req as AuthRequest).user?.user_id,
      action: "GET_COMPLAINT_STATS_ERROR",
      module: "complaints",
      description: `Failed to fetch stats for site ${req.params.siteCode}: ${error.message}`,
      ip_address: req.ip,
      metadata: { error: error.message, siteCode: req.params.siteCode },
    }).catch(() => {});
    return sendServerError(res, error);
  }
};

export const getAll = async (req: Request, res: Response) => {
  req.params.siteCode = "all";
  return getBySite(req, res);
};

export const bulkUpsert = asyncHandler(async (req: Request, res: Response) => {
  const { tickets } = req.body;
  if (!tickets || !Array.isArray(tickets)) {
    return sendError(res, "Invalid tickets provided");
  }
  const result = await complaintsRepository.bulkUpsertComplaints(tickets);
  return sendSuccess(res, result);
});

export const syncFieldproxySingle = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { id } = req.params as { id: string };
    if (!id) {
      return sendError(res, "Ticket identifier is required");
    }

    const complaint = await complaintsRepository.getComplaint(id);
    if (!complaint) {
      return sendNotFound(res, "Complaint");
    }

    logActivity({
      user_id: req.user?.user_id,
      action: "MANUAL_FIELDPROXY_SYNC_START",
      module: "complaints",
      description: `Manual Fieldproxy sync started for ${complaint.ticket_no}`,
      ip_address: req.ip,
      metadata: { ticket_no: complaint.ticket_no, mode: "single" },
    }).catch(() => {});

    const result = await syncComplaintToFieldproxyUpsert(complaint);

    logActivity({
      user_id: req.user?.user_id,
      action:
        result.action === "failed"
          ? "MANUAL_FIELDPROXY_SYNC_FAILED"
          : "MANUAL_FIELDPROXY_SYNC_SUCCESS",
      module: "complaints",
      description:
        result.action === "failed"
          ? `Manual Fieldproxy sync failed for ${complaint.ticket_no}`
          : `Manual Fieldproxy sync ${result.action} for ${complaint.ticket_no}`,
      ip_address: req.ip,
      metadata: {
        ticket_no: complaint.ticket_no,
        mode: "single",
        action: result.action,
        error: result.error,
      },
    }).catch(() => {});

    if (result.action === "failed") {
      return sendError(res, result.error || "Fieldproxy sync failed", {
        status: 500,
      });
    }

    return sendSuccess(res, result, {
      message: `Fieldproxy sync ${result.action} for ${complaint.ticket_no}`,
    });
  },
);

export const syncFieldproxyBulk = asyncHandler(
  async (req: AuthRequest, res: Response) => {
    const { ticket_nos, ids } = req.body as {
      ticket_nos?: string[];
      ids?: string[];
    };

    const targets = Array.isArray(ticket_nos)
      ? ticket_nos
      : Array.isArray(ids)
        ? ids
        : [];

    if (targets.length === 0) {
      return sendError(res, "ticket_nos (or ids) array is required");
    }

    const uniqueTargets = Array.from(new Set(targets.map((t) => String(t).trim()).filter(Boolean)));
    const results: ManualFieldproxySyncResult[] = [];

    for (const target of uniqueTargets) {
      const complaint = await complaintsRepository.getComplaint(target);
      if (!complaint) {
        results.push({
          ticket_no: target,
          action: "failed",
          error: "Complaint not found",
        });
        continue;
      }

      const result = await syncComplaintToFieldproxyUpsert(complaint);
      results.push(result);

      logActivity({
        user_id: req.user?.user_id,
        action:
          result.action === "failed"
            ? "MANUAL_FIELDPROXY_SYNC_FAILED"
            : "MANUAL_FIELDPROXY_SYNC_SUCCESS",
        module: "complaints",
        description:
          result.action === "failed"
            ? `Bulk manual Fieldproxy sync failed for ${complaint.ticket_no}`
            : `Bulk manual Fieldproxy sync ${result.action} for ${complaint.ticket_no}`,
        ip_address: req.ip,
        metadata: {
          ticket_no: complaint.ticket_no,
          mode: "bulk",
          action: result.action,
          error: result.error,
        },
      }).catch(() => {});
    }

    const summary = {
      total: results.length,
      updated: results.filter((r) => r.action === "updated").length,
      created: results.filter((r) => r.action === "created").length,
      failed: results.filter((r) => r.action === "failed").length,
    };

    return sendSuccess(
      res,
      { summary, results },
      {
        message: `Fieldproxy bulk sync completed: updated ${summary.updated}, created ${summary.created}, failed ${summary.failed}`,
      },
    );
  },
);

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
  bulkUpsert,
  syncFieldproxySingle,
  syncFieldproxyBulk,
};
