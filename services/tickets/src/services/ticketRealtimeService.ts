import type { Response } from "express";
import { query } from "@jouleops/shared";
import type { AuthRequest } from "../middleware/auth.ts";

type TicketRealtimeEventType =
  | "ticket_created"
  | "ticket_updated"
  | "ticket_status_changed"
  | "ticket_line_item_added";

type TicketRealtimeEvent = {
  event_id: string;
  event_type: TicketRealtimeEventType;
  ticket_id: string;
  site_code: string;
  ticket_no?: string;
  updated_at: string;
  payload?: Record<string, unknown>;
};

type Subscriber = {
  userId: string;
  siteCodes: Set<string>;
  res: Response;
};

const HEARTBEAT_MS = 25000;
const realtimeEnabled = String(process.env.ENABLE_TICKETS_REALTIME ?? "true").toLowerCase() !== "false";

class TicketRealtimeService {
  private subscribers = new Map<string, Subscriber>();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor() {
    if (realtimeEnabled) {
      this.heartbeat = setInterval(() => {
        for (const [id, sub] of this.subscribers) {
          try {
            sub.res.write(`: keep-alive ${Date.now()}\n\n`);
          } catch {
            this.subscribers.delete(id);
          }
        }
      }, HEARTBEAT_MS);
    }
  }

  isEnabled() {
    return realtimeEnabled;
  }

  private generateEventId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async getAllowedSiteCodes(req: AuthRequest): Promise<string[]> {
    const userId = req.user?.user_id || req.user?.id;
    if (!userId) return [];

    if (req.user?.is_superadmin || String(req.user?.role || "").toLowerCase() === "admin") {
      const rows = await query<{ site_code: string }>("SELECT site_code FROM sites");
      return rows.map((r) => r.site_code).filter(Boolean);
    }

    const rows = await query<{ site_code: string }>(
      `SELECT s.site_code
       FROM site_user su
       JOIN sites s ON s.site_id = su.site_id
       WHERE su.user_id = $1`,
      [userId],
    );
    return rows.map((r) => r.site_code).filter(Boolean);
  }

  subscribe(params: { req: AuthRequest; res: Response; requestedSiteCode?: string | null }) {
    const { req, res, requestedSiteCode } = params;
    const userId = req.user?.user_id || req.user?.id || "unknown";
    const clientId = `${userId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const subscriber: Subscriber = {
      userId,
      siteCodes: new Set(),
      res,
    };
    this.subscribers.set(clientId, subscriber);

    const close = () => {
      this.subscribers.delete(clientId);
    };
    req.on("close", close);
    req.on("error", close);

    return {
      clientId,
      setSiteCodes: (siteCodes: string[]) => {
        const filtered = requestedSiteCode
          ? siteCodes.filter((siteCode) => siteCode === requestedSiteCode)
          : siteCodes;
        subscriber.siteCodes = new Set(filtered);
      },
      close,
    };
  }

  publish(input: {
    eventType: TicketRealtimeEventType;
    ticketId: string;
    siteCode: string;
    ticketNo?: string;
    updatedAt?: string | Date;
    payload?: Record<string, unknown>;
  }) {
    if (!realtimeEnabled) return;
    const event: TicketRealtimeEvent = {
      event_id: this.generateEventId(),
      event_type: input.eventType,
      ticket_id: String(input.ticketId),
      site_code: String(input.siteCode),
      ticket_no: input.ticketNo,
      updated_at:
        input.updatedAt instanceof Date
          ? input.updatedAt.toISOString()
          : (input.updatedAt || new Date().toISOString()),
      payload: input.payload || {},
    };

    const body = JSON.stringify(event);
    for (const [id, sub] of this.subscribers) {
      if (!sub.siteCodes.has(event.site_code)) continue;
      try {
        sub.res.write(`event: ${event.event_type}\n`);
        sub.res.write(`data: ${body}\n\n`);
      } catch {
        this.subscribers.delete(id);
      }
    }
  }
}

export const ticketRealtimeService = new TicketRealtimeService();

