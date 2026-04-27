import type { Request, Response } from "express";
import complaintImagesRepository from "../repositories/complaintImagesRepository.ts";
import complaintsRepository from "../repositories/complaintsRepository.ts";
import whatsappService from "../services/whatsappService.ts";
import { ticketRealtimeService } from "../services/ticketRealtimeService.ts";
import {
  sendSuccess,
  sendError,
  sendCreated,
  logActivity,
  type AuthRequest,
} from "@jouleops/shared";

class ComplaintImagesController {
  /**
   * Get all line items for a specific ticket
   */
  async getLineItems(req: Request, res: Response) {
    try {
      const ticketId = req.params.id || (req as any).params.ticketId;

      if (!ticketId) {
        return sendError(res, "ticketId parameter is required", {
          status: 400,
        });
      }

      const items = await complaintImagesRepository.getByTicketId(ticketId);

      return sendSuccess(res, items, {
        message: "Line items fetched successfully",
      });
    } catch (error: any) {
      console.error("Error fetching line items:", error);
      logActivity({
        user_id: (req as AuthRequest).user?.user_id,
        action: "GET_LINE_ITEMS_ERROR",
        module: "complaints",
        description: `Failed to fetch line items for ticket ${req.params.id || (req as any).params.ticketId}: ${error.message}`,
        ip_address: req.ip,
        metadata: {
          error: error.message,
          ticketId: req.params.id || (req as any).params.ticketId,
        },
      }).catch(() => {});
      return sendError(res, "Failed to fetch line items: " + error.message, {
        status: 500,
      });
    }
  }

  /**
   * Add a new line item to a ticket
   */
  async addLineItem(req: Request, res: Response) {
    try {
      const ticketId = req.params.id || (req as any).params.ticketId;
      const { image_url, video_url, message_text, message_id, ignore_notification } = req.body;

      console.log(`[LINE_ITEM] Adding line item:`, {
        ticketId,
        hasImage: !!image_url,
        hasVideo: !!video_url,
        hasMessage: !!message_text,
        messageId: message_id,
        ignore_notification: !!ignore_notification
      });

      if (!ticketId) {
        return sendError(res, "ticketId parameter is required", {
          status: 400,
        });
      }

      const newItem = await complaintImagesRepository.addLineItem({
        ticket_id: ticketId,
        image_url,
        video_url,
        message_text,
        message_id,
      });
      const complaint = await complaintsRepository.getComplaint(ticketId);
      if (complaint?.site_code) {
        ticketRealtimeService.publish({
          eventType: "ticket_line_item_added",
          ticketId: complaint.id,
          siteCode: complaint.site_code,
          ticketNo: complaint.ticket_no,
          updatedAt: new Date(),
          payload: {
            line_item_id: newItem.message_id || null,
            has_image: Boolean(newItem.image_url),
            has_video: Boolean(newItem.video_url),
            has_text: Boolean(newItem.message_text),
          },
        });
      }

      console.log(`[LINE_ITEM] Line item created:`, { 
        ticketId, 
        hasMessage: !!newItem.message_text,
        hasImage: !!newItem.image_url,
        willSendWhatsApp: !ignore_notification && (!!message_text || !!image_url)
      });

      // Trigger WhatsApp notifications only if ignore_notification is not true
      if (!ignore_notification) {
        // Trigger WhatsApp notification for text messages (Fire and Forget)
        if (message_text) {
          console.log(`[LINE_ITEM] Triggering WhatsApp for message:`, { ticketId });
          (async () => {
            try {
              const ticket = await complaintsRepository.getComplaint(ticketId);
              if (ticket) {
                console.log(`[LINE_ITEM] Found ticket, sending WhatsApp:`, {
                  ticketNo: ticket.ticket_no,
                  siteCode: ticket.site_code
                });
                await whatsappService.sendActivityMessage(
                  ticket.site_code,
                  ticket.ticket_no,
                  message_text,
                );
              } else {
                console.warn(`[LINE_ITEM] Ticket not found for WhatsApp:`, { ticketId });
              }
            } catch (err: any) {
              console.error("WhatsApp activity trigger failed:", {
                error: err.message,
                ticketId,
                stack: err.stack
              });
            }
          })();
        }

        // Trigger WhatsApp notification for images (Fire and Forget)
        if (image_url) {
          console.log(`[LINE_ITEM] Triggering WhatsApp for image:`, { ticketId });
          (async () => {
            try {
              const ticket = await complaintsRepository.getComplaint(ticketId);
              if (ticket) {
                console.log(`[LINE_ITEM] Found ticket, sending WhatsApp image:`, {
                  ticketNo: ticket.ticket_no,
                  siteCode: ticket.site_code
                });
                await whatsappService.sendActivityImage(
                  ticket.site_code,
                  ticket.ticket_no,
                  image_url,
                );
              } else {
                console.warn(`[LINE_ITEM] Ticket not found for WhatsApp image:`, { ticketId });
              }
            } catch (err: any) {
              console.error("WhatsApp image activity trigger failed:", {
                error: err.message,
                ticketId,
                stack: err.stack
              });
            }
          })();
        }
      }


      return sendCreated(res, newItem, "Line item added successfully");
    } catch (error: any) {
      console.error("Error adding line item:", error);
      logActivity({
        user_id: (req as AuthRequest).user?.user_id,
        action: "ADD_LINE_ITEM_ERROR",
        module: "complaints",
        description: `Failed to add line item to ticket ${req.params.id || (req as any).params.ticketId}: ${error.message}`,
        ip_address: req.ip,
        metadata: {
          error: error.message,
          ticketId: req.params.id || (req as any).params.ticketId,
          body: req.body,
        },
      }).catch(() => {});
      return sendError(res, "Failed to add line item: " + error.message, {
        status: 500,
      });
    }
  }
}

export default new ComplaintImagesController();
