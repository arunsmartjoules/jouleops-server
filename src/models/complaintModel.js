export const VALID_STATUSES = [
  "Open",
  "Inprogress",
  "Resolved",
  "Hold",
  "Waiting",
  "Cancelled",
];
export const VALID_CATEGORIES = ["Complaint", "Service Request"];

// Validate complaint data before insert
export const validateComplaint = (data) => {
  const errors = [];

  if (!data.site_id) {
    errors.push("site_id is required");
  }

  if (!data.title) {
    errors.push("title is required");
  }

  if (!data.location) {
    errors.push("location is required");
  }

  if (data.status && !VALID_STATUSES.includes(data.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  if (data.category && !VALID_CATEGORIES.includes(data.category)) {
    errors.push(`category must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Format complaint data for insert
export const formatComplaintForInsert = (data) => {
  return {
    site_id: data.site_id,
    title: data.title,
    location: data.location,
    status: data.status || "Open",
    category: data.category || "Complaint",
    sender_id: data.sender_id || null,
    message_id: data.message_id || null,
    group_id: data.group_id || null,
    created_user: data.created_user || null,
    area_asset: data.area_asset || null,
    customer_inputs: data.customer_inputs || null,
    internal_remarks: data.internal_remarks || null,
    notes: data.notes || null,
    contact_name: data.contact_name || null,
    contact_number: data.contact_number || null,
    remarks: data.remarks || null,
    current_temperature: data.current_temperature || null,
    current_rh: data.current_rh || null,
    standard_temperature: data.standard_temperature || null,
    standard_rh: data.standard_rh || null,
    spare_type: data.spare_type || null,
    spare_quantity: data.spare_quantity || null,
    escalation_source: data.escalation_source || null,
    assigned_to: data.assigned_to || null,
    sub_ticket_id: data.sub_ticket_id || null,
    reason: data.reason || null,
    support_users: data.support_users || null,
    support_users_name: data.support_users_name || null,
  };
};

// Format complaint for API response
export const formatComplaintResponse = (complaint) => {
  return {
    ticket_id: complaint.ticket_id,
    ticket_no: complaint.ticket_no,
    title: complaint.title,
    location: complaint.location,
    status: complaint.status,
    category: complaint.category,
    site_id: complaint.site_id,
    assigned_to: complaint.assigned_to,
    area_asset: complaint.area_asset,
    internal_remarks: complaint.internal_remarks,
    remarks: complaint.remarks,
    created_at: complaint.created_at,
    updated_at: complaint.updated_at,
  };
};

export default {
  VALID_STATUSES,
  VALID_CATEGORIES,
  validateComplaint,
  formatComplaintForInsert,
  formatComplaintResponse,
};
