import type { Request, Response } from "express";
import { logActivity, sendCreated, sendError, sendNotFound, sendServerError, sendSuccess, type AuthRequest } from "@jouleops/shared";
import incidentsRepository from "../repositories/incidentsRepository.ts";
import { sendIncidentEventNotifications } from "../services/notificationService.ts";
import {
  forwardIncidentToFieldproxy,
  updateIncidentInFieldproxy,
} from "../services/fieldproxyService.ts";

const VALID_STATUS = ["Open", "Inprogress", "Resolved"];
const PRIVILEGED_ROLES = new Set(["admin", "manager"]);

const isPrivileged = (req: AuthRequest) =>
  PRIVILEGED_ROLES.has(String(req.user?.role || "").toLowerCase());

const getActorName = (req: AuthRequest) =>
  req.user?.user_id || "system";

const normalizeAssignedTo = (input: unknown): string[] => {
  if (Array.isArray(input)) return input.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 1);
  if (typeof input === "string" && input.trim()) return [input.trim()];
  return [];
};

const normalizeJsonArrayInput = (input: unknown): any[] => {
  if (Array.isArray(input)) return input;
  if (typeof input === "string" && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const toIsoString = (value?: Date | string | null) => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const toSingleAssigned = (value: unknown): string | null => {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : null;
  if (typeof value === "string") return value;
  return null;
};

const buildIncidentFieldproxyPayload = (incident: any) => ({
  incident_id: incident.incident_id ?? null,
  source: incident.source ?? null,
  site: incident.site_code ?? null,
  asset_location: incident.asset_location ?? null,
  raised_by: incident.raised_by ?? null,
  timestamp: toIsoString(incident.created_at) ?? toIsoString(incident.incident_created_time),
  fault_symptom: incident.fault_symptom ?? null,
  fault_type: incident.fault_type ?? null,
  severity: incident.severity ?? null,
  operating_condition: incident.operating_condition ?? null,
  immediate_action_taken: incident.immediate_action_taken ?? null,
  attachments: incident.attachments ?? null,
  remarks: incident.remarks ?? null,
  status: incident.status ?? null,
  assigned_by: incident.assigned_by ?? null,
  assignment_type: incident.assignment_type ?? null,
  vendor_tagged: incident.vendor_tagged ?? null,
  rca_status: incident.rca_status ?? null,
  rca_maker: incident.rca_maker ?? null,
  rca_checker: incident.rca_checker ?? null,
  assigned_to: toSingleAssigned(incident.assigned_to),
  incident_created_time: toIsoString(incident.incident_created_time),
  incident_updated_time: toIsoString(incident.incident_updated_time),
  incident_resolved_time: toIsoString(incident.incident_resolved_time),
  rca_attachments: incident.rca_attachments ?? null,
});

export const list = async (req: Request, res: Response) => {
  try {
    const result = await incidentsRepository.listIncidents(req.query as any);
    return sendSuccess(res, result.data, { pagination: result.pagination });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return sendError(res, "Incident ID is required");
    const incident = await incidentsRepository.getIncidentById(id);
    if (!incident) return sendNotFound(res, "Incident");
    return sendSuccess(res, incident);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const create = async (req: AuthRequest, res: Response) => {
  try {
    const privileged = isPrivileged(req);
    const currentUserId = req.user?.user_id || null;
    const assigned_to = privileged
      ? normalizeAssignedTo(req.body?.assigned_to)
      : (currentUserId ? [currentUserId] : []);
    const payload = {
      ...req.body,
      raised_by: req.body.raised_by || req.user?.user_id || null,
      assigned_to,
      attachments: normalizeJsonArrayInput(req.body?.attachments),
      rca_attachments: normalizeJsonArrayInput(req.body?.rca_attachments),
      assigned_by: assigned_to.length
        ? (privileged ? getActorName(req) : "system")
        : req.body?.assigned_by || null,
      incident_created_time: privileged
        ? (req.body?.incident_created_time || undefined)
        : undefined,
    };
    const incident = await incidentsRepository.createIncident(payload);
    sendIncidentEventNotifications("incident_created", incident as any).catch(() => {});
    forwardIncidentToFieldproxy(buildIncidentFieldproxyPayload(incident))
      .then((fpResponse) =>
        logActivity({
          user_id: req.user?.user_id,
          action: "FORWARD_INCIDENT_TO_FIELDPROXY",
          module: "incidents",
          description: `Incident ${incident.incident_id} forwarded to Fieldproxy`,
          ip_address: req.ip,
          metadata: { incident_id: incident.incident_id, site_code: incident.site_code, fieldproxy_response: fpResponse },
        }).catch(() => {}),
      )
      .catch((err: Error) =>
        logActivity({
          user_id: req.user?.user_id,
          action: "FORWARD_INCIDENT_TO_FIELDPROXY_FAILED",
          module: "incidents",
          description: `Failed to forward incident ${incident.incident_id} to Fieldproxy: ${err.message}`,
          ip_address: req.ip,
          metadata: { incident_id: incident.incident_id, site_code: incident.site_code, error: err.message },
        }).catch(() => {}),
      );
    return sendCreated(res, incident, "Incident created successfully");
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const update = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return sendError(res, "Incident ID is required");
    const existing = await incidentsRepository.getIncidentById(id);
    if (!existing) return sendNotFound(res, "Incident");
    const privileged = isPrivileged(req);
    const assigned_to = req.body?.assigned_to !== undefined
      ? (privileged ? normalizeAssignedTo(req.body.assigned_to) : undefined)
      : undefined;
    const patch = {
      ...req.body,
      ...(assigned_to !== undefined ? { assigned_to } : {}),
      ...(assigned_to !== undefined
        ? {
            assigned_by:
              assigned_to.length > 0
                ? (privileged ? getActorName(req) : "system")
                : req.body?.assigned_by || null,
          }
        : {}),
      ...(privileged ? {} : {
        incident_created_time: undefined,
        incident_updated_time: undefined,
        incident_resolved_time: undefined,
        rca_maker: undefined,
      }),
    };
    const incident = await incidentsRepository.updateIncident(existing.id, patch);
    updateIncidentInFieldproxy(existing.incident_id, buildIncidentFieldproxyPayload(incident))
      .then((syncResult) =>
        logActivity({
          user_id: req.user?.user_id,
          action: "UPDATE_INCIDENT_FIELDPROXY",
          module: "incidents",
          description: `Incident ${existing.incident_id} synced to Fieldproxy`,
          ip_address: req.ip,
          metadata: { incident_id: existing.incident_id, site_code: incident.site_code, fieldproxy_response: syncResult },
        }).catch(() => {}),
      )
      .catch((err: Error) =>
        logActivity({
          user_id: req.user?.user_id,
          action: "UPDATE_INCIDENT_FIELDPROXY_FAILED",
          module: "incidents",
          description: `Failed to sync incident ${existing.incident_id} to Fieldproxy: ${err.message}`,
          ip_address: req.ip,
          metadata: { incident_id: existing.incident_id, site_code: incident.site_code, error: err.message },
        }).catch(() => {}),
      );
    return sendSuccess(res, incident, { message: "Incident updated successfully" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return sendError(res, "Incident ID is required");
    const existing = await incidentsRepository.getIncidentById(id);
    if (!existing) return sendNotFound(res, "Incident");
    const { status, remarks, incident_updated_time, incident_resolved_time, assigned_to } =
      req.body as {
        status: string;
        remarks?: string;
        incident_updated_time?: string | null;
        incident_resolved_time?: string | null;
        assigned_to?: string | string[] | null;
      };
    if (!VALID_STATUS.includes(status)) {
      return sendError(res, "Invalid status");
    }
    if (status === "Resolved" && existing.status !== "Inprogress") {
      return sendError(res, "Only incidents in 'Inprogress' can be resolved.");
    }
    if (status === "Resolved" && !remarks?.trim()) {
      return sendError(res, "Remarks are required when resolving an incident.");
    }
    const privileged = isPrivileged(req);
    const normalizedAssigned =
      assigned_to !== undefined
        ? (privileged ? normalizeAssignedTo(assigned_to) : undefined)
        : undefined;
    const updated = await incidentsRepository.updateIncidentStatus(
      existing.id,
      status as any,
      remarks,
      {
        incident_updated_time:
          privileged && incident_updated_time ? new Date(incident_updated_time) : undefined,
        incident_resolved_time:
          privileged && incident_resolved_time ? new Date(incident_resolved_time) : undefined,
        assigned_to: normalizedAssigned,
        assigned_by:
          normalizedAssigned !== undefined
            ? (normalizedAssigned.length > 0 ? (privileged ? getActorName(req) : "system") : null)
            : undefined,
      },
    );
    if (existing.status !== updated.status) {
      if (updated.status === "Inprogress") {
        sendIncidentEventNotifications("incident_inprogress", updated as any).catch(() => {});
      } else if (updated.status === "Resolved") {
        sendIncidentEventNotifications("incident_resolved", updated as any).catch(() => {});
      }
    }
    updateIncidentInFieldproxy(existing.incident_id, buildIncidentFieldproxyPayload(updated))
      .then((syncResult) =>
        logActivity({
          user_id: req.user?.user_id,
          action: "UPDATE_INCIDENT_STATUS_FIELDPROXY",
          module: "incidents",
          description: `Incident ${existing.incident_id} status synced to Fieldproxy`,
          ip_address: req.ip,
          metadata: { incident_id: existing.incident_id, site_code: updated.site_code, fieldproxy_response: syncResult },
        }).catch(() => {}),
      )
      .catch((err: Error) =>
        logActivity({
          user_id: req.user?.user_id,
          action: "UPDATE_INCIDENT_STATUS_FIELDPROXY_FAILED",
          module: "incidents",
          description: `Failed to sync incident status ${existing.incident_id} to Fieldproxy: ${err.message}`,
          ip_address: req.ip,
          metadata: { incident_id: existing.incident_id, site_code: updated.site_code, error: err.message },
        }).catch(() => {}),
      );
    return sendSuccess(res, updated, { message: "Incident status updated successfully" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const updateRcaStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!isPrivileged(req)) {
      return sendError(res, "Only Admin/Manager can update RCA status", { status: 403 });
    }
    const id = req.params.id;
    if (!id) return sendError(res, "Incident ID is required");
    const existing = await incidentsRepository.getIncidentById(id);
    if (!existing) return sendNotFound(res, "Incident");
    const incomingRca = Array.isArray(req.body?.rca_attachments) ? req.body.rca_attachments : undefined;
    const currentRca = Array.isArray(existing.rca_attachments) ? existing.rca_attachments : [];
    const updated = await incidentsRepository.updateIncident(existing.id, {
      rca_status: req.body.rca_status,
      rca_checker: req.body?.rca_checker || existing.rca_checker || null,
      rca_maker: getActorName(req),
      rca_attachments: incomingRca ? [...currentRca, ...incomingRca] : currentRca,
    });
    updateIncidentInFieldproxy(existing.incident_id, buildIncidentFieldproxyPayload(updated)).catch(() => {});
    return sendSuccess(res, updated, { message: "RCA status updated successfully" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const addAttachment = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (!id) return sendError(res, "Incident ID is required");
    const existing = await incidentsRepository.getIncidentById(id);
    if (!existing) return sendNotFound(res, "Incident");
    const updated = await incidentsRepository.appendIncidentAttachment(
      existing.id,
      req.body.attachment,
    );
    updateIncidentInFieldproxy(existing.incident_id, buildIncidentFieldproxyPayload(updated)).catch(() => {});
    return sendSuccess(res, updated, { message: "Attachment added successfully" });
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const stats = await incidentsRepository.getIncidentStats(req.query.site_code as string | undefined);
    return sendSuccess(res, stats);
  } catch (error: any) {
    return sendServerError(res, error);
  }
};

export default {
  list,
  getById,
  create,
  update,
  updateStatus,
  updateRcaStatus,
  addAttachment,
  getStats,
};
