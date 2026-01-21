import supabase from "../config/supabase.js";
import logger from "../utils/logger.js";

const WHAPI_TOKEN = process.env.WHAPI_TOKEN;
const WHAPI_URL = "https://gate.whapi.cloud/messages/text";

/**
 * Service to handle WhatsApp messages via Whapi
 */
export const whapiService = {
  /**
   * Send a text message to a WhatsApp group
   * @param {string} groupId - Whapi group ID
   * @param {string} content - Message text
   * @param {Object} metadata - Useful for logging (ticket_id, ticket_no, etc.)
   */
  async sendGroupMessage(groupId, content, metadata = {}) {
    const { ticket_id, ticket_no, site_id, sent_by } = metadata;

    if (!WHAPI_TOKEN) {
      logger.warn(
        "WHAPI_TOKEN is missing. WhatsApp message was not sent (simulation mode).",
        {
          module: "WHAPI_SERVICE",
          groupId,
          ticket_no,
        },
      );

      // Still log to database as 'simulated'
      await this.logMessage({
        ticket_id,
        ticket_no,
        site_id,
        group_id: groupId,
        message_content: content,
        status: "simulated",
        sent_by,
      });

      return { success: true, simulated: true };
    }

    try {
      const response = await fetch(WHAPI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WHAPI_TOKEN}`,
        },
        body: JSON.stringify({
          to: groupId,
          body: content,
        }),
      });

      const whapiResponse = await response.json();
      const status = response.ok ? "sent" : "failed";

      if (!response.ok) {
        logger.error("Whapi API error", {
          module: "WHAPI_SERVICE",
          status: response.status,
          error: whapiResponse,
        });
      }

      // Log the attempt
      await this.logMessage({
        ticket_id,
        ticket_no,
        site_id,
        group_id: groupId,
        message_content: content,
        status,
        whapi_response: whapiResponse,
        error_message: response.ok ? null : JSON.stringify(whapiResponse),
        sent_by,
      });

      return {
        success: response.ok,
        whapiResponse,
      };
    } catch (error) {
      logger.error("Fatal error in whapiService", {
        module: "WHAPI_SERVICE",
        error: error.message,
      });

      await this.logMessage({
        ticket_id,
        ticket_no,
        site_id,
        group_id: groupId,
        message_content: content,
        status: "error",
        error_message: error.message,
        sent_by,
      });

      return { success: false, error: error.message };
    }
  },

  /**
   * Internal helper to log messages to the audit table
   */
  async logMessage(logData) {
    try {
      const { error } = await supabase
        .from("whatsapp_message_logs")
        .insert([logData]);

      if (error) {
        logger.error("Failed to log WhatsApp message", {
          module: "WHAPI_SERVICE",
          error: error.message,
        });
      }
    } catch (err) {
      logger.error("Database error while logging WhatsApp message", {
        module: "WHAPI_SERVICE",
        error: err.message,
      });
    }
  },

  /**
   * Parse template with variables
   * @param {string} template - Content with {{var}} placeholders
   * @param {Object} variables - Key-value pairs
   */
  parseTemplate(template, variables) {
    let content = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, "g");
      content = content.replace(regex, value || "");
    }
    return content;
  },
};

export default whapiService;
