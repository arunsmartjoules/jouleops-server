export const VALID_FREQUENCIES = [
  "Daily",
  "Weekly",
  "Monthly",
  "Quarterly",
  "Half-Yearly",
  "Yearly",
];
export const VALID_STATUSES = [
  "Pending",
  "In Progress",
  "Completed",
  "Overdue",
  "Cancelled",
];

export const validatePMInstance = (data) => {
  const errors = [];

  if (!data.instance_id) {
    errors.push("instance_id is required");
  }

  if (!data.site_id) {
    errors.push("site_id is required");
  }

  if (data.frequency && !VALID_FREQUENCIES.includes(data.frequency)) {
    errors.push(`frequency must be one of: ${VALID_FREQUENCIES.join(", ")}`);
  }

  if (data.status && !VALID_STATUSES.includes(data.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

export const formatPMInstanceForInsert = (data) => {
  return {
    instance_id: data.instance_id,
    site_id: data.site_id,
    asset_id: data.asset_id || null,
    maintenance_id: data.maintenance_id || null,
    checklist_version: data.checklist_version || 1,
    title: data.title || null,
    description: data.description || null,
    location: data.location || null,
    asset_type: data.asset_type || null,
    floor: data.floor || null,
    frequency: data.frequency || null,
    start_due_date: data.start_due_date || null,
    start_datetime: data.start_datetime || null,
    end_datetime: data.end_datetime || null,
    status: data.status || "Pending",
    progress: data.progress || 0,
    estimated_duration: data.estimated_duration || null,
    inventory_id: data.inventory_id || null,
    created_by: data.created_by || null,
    updated_by: data.updated_by || null,
    assigned_to: data.assigned_to || null,
    teams: data.teams || null,
    teams_name: data.teams_name || null,
    assigned_to_name: data.assigned_to_name || null,
    remarks: data.remarks || null,
  };
};

export default {
  VALID_FREQUENCIES,
  VALID_STATUSES,
  validatePMInstance,
  formatPMInstanceForInsert,
};
