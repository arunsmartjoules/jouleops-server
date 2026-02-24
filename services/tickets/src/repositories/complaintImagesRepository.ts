import { query } from "@jouleops/shared";

export interface ComplaintImage {
  ticket_id: string;
  image_url?: string;
  video_url?: string;
  message_text?: string;
  message_id?: string;
  created_at: Date;
}

class ComplaintImagesRepository {
  /**
   * Fetch all line items for a specific ticket
   */
  async getByTicketId(ticketId: string): Promise<ComplaintImage[]> {
    try {
      return await query<ComplaintImage>(
        `SELECT * FROM complaint_images WHERE ticket_id = $1 ORDER BY created_at ASC`,
        [ticketId],
      );
    } catch (error) {
      console.error("Error in getByTicketId:", error);
      throw error;
    }
  }

  /**
   * Add a new line item to a ticket
   */
  async addLineItem(data: {
    ticket_id: string;
    image_url?: string;
    video_url?: string;
    message_text?: string;
    message_id?: string;
  }): Promise<ComplaintImage> {
    try {
      const result = await query<ComplaintImage>(
        `INSERT INTO complaint_images 
         (ticket_id, image_url, video_url, message_text, message_id) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [
          data.ticket_id,
          data.image_url || null,
          data.video_url || null,
          data.message_text || null,
          data.message_id || null,
        ],
      );
      if (!result || result.length === 0) {
        throw new Error("Failed to insert line item");
      }
      return result[0] as ComplaintImage;
    } catch (error) {
      console.error("Error in addLineItem:", error);
      throw error;
    }
  }
}

export default new ComplaintImagesRepository();
