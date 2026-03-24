/**
 * WhatsApp Internal Service
 * Handles communication with the utility service for outbound messages.
 */

const UTILITY_SERVICE_URL =
  process.env.UTILITY_SERVICE_URL || "http://localhost:3428";

export const sendActivityMessage = async (
  siteCode: string,
  ticketNo: string,
  message: string,
) => {
  try {
    const response = await fetch(`${UTILITY_SERVICE_URL}/api/whatsapp/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.INTERNAL_API_KEY || "smartops-internal-key",
      },
      body: JSON.stringify({
        site_code: siteCode,
        message: `*Ticket ${ticketNo} Activity:*\n\n${message}`,
        ticket_no: ticketNo,
        template_key: "activity_update",
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Failed to send internal WhatsApp notification:", {
        status: response.status,
        error,
      });
      return { success: false, error };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error calling internal WhatsApp service:", err.message);
    return { success: false, error: err.message };
  }
};

export const sendActivityImage = async (
  siteCode: string,
  ticketNo: string,
  imageUrl: string,
) => {
  try {
    const response = await fetch(`${UTILITY_SERVICE_URL}/api/whatsapp/send-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.INTERNAL_API_KEY || "smartops-internal-key",
      },
      body: JSON.stringify({
        site_code: siteCode,
        image_url: imageUrl,
        caption: `*Ticket ${ticketNo} Activity (Image)*`,
        ticket_no: ticketNo,
        template_key: "activity_update",
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Failed to send internal WhatsApp image notification:", {
        status: response.status,
        error,
      });
      return { success: false, error };
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error calling internal WhatsApp image service:", err.message);
    return { success: false, error: err.message };
  }
};

export default {
  sendActivityMessage,
  sendActivityImage,
};
