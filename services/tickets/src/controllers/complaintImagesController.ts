import type { Request, Response } from "express";
import complaintImagesRepository from "../repositories/complaintImagesRepository.ts";
import complaintsRepository from "../repositories/complaintsRepository.ts";
import whatsappService from "../services/whatsappService.ts";
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
      const { image_url, video_url, message_text, message_id } = req.body;

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

      // Trigger WhatsApp notification for text messages (Fire and Forget)
      if (message_text) {
        (async () => {
          try {
            const ticket = await complaintsRepository.getComplaint(ticketId);
            if (ticket) {
              await whatsappService.sendActivityMessage(
                ticket.site_code,
                ticket.ticket_no,
                message_text,
              );
            }
          } catch (err) {
            console.error("WhatsApp activity trigger failed:", err);
          }
        })();
      }

      // Trigger WhatsApp notification for images (Fire and Forget)
      if (image_url) {
        (async () => {
          try {
            const ticket = await complaintsRepository.getComplaint(ticketId);
            if (ticket) {
              await whatsappService.sendActivityImage(
                ticket.site_code,
                ticket.ticket_no,
                image_url,
              );
            }
          } catch (err) {
            console.error("WhatsApp image activity trigger failed:", err);
          }
        })();
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
