import express from "express";
import type { Response } from "express";
import { verifyToken, type AuthRequest } from "../middleware/auth.ts";
import { ticketRealtimeService } from "../services/ticketRealtimeService.ts";

const router = express.Router();

router.get("/complaints/stream", verifyToken, async (req: AuthRequest, res: Response) => {
  if (!ticketRealtimeService.isEnabled()) {
    return res.status(503).json({
      success: false,
      error: "Tickets realtime stream is disabled",
    });
  }

  try {
    const requestedSiteCode =
      typeof req.query.site_code === "string" && req.query.site_code.trim()
        ? req.query.site_code.trim()
        : null;
    const allowedSites = await ticketRealtimeService.getAllowedSiteCodes(req);

    if (allowedSites.length === 0) {
      return res.status(403).json({
        success: false,
        error: "No site access for realtime stream",
      });
    }

    if (requestedSiteCode && !allowedSites.includes(requestedSiteCode)) {
      return res.status(403).json({
        success: false,
        error: "Not authorized for requested site",
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const subscription = ticketRealtimeService.subscribe({
      req,
      res,
      requestedSiteCode,
    });
    subscription.setSiteCodes(allowedSites);
    res.write(`event: ready\n`);
    res.write(
      `data: ${JSON.stringify({
        ok: true,
        site_codes: requestedSiteCode ? [requestedSiteCode] : allowedSites,
        ts: new Date().toISOString(),
      })}\n\n`,
    );
    return;
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error?.message || "Failed to establish realtime stream",
    });
  }
});

export default router;

