import type { Request, Response } from "express";
import complaintImagesRepository from "../repositories/complaintImagesRepository.ts";
import { sendSuccess, sendError, sendCreated } from "@jouleops/shared";

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

      return sendCreated(res, newItem, "Line item added successfully");
    } catch (error: any) {
      console.error("Error adding line item:", error);
      return sendError(res, "Failed to add line item: " + error.message, {
        status: 500,
      });
    }
  }
}

export default new ComplaintImagesController();
