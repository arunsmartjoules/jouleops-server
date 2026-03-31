import { z } from "zod";

/**
 * Site Log Schemas
 */
export const createSiteLogSchema = z.object({
  site_code: z.string().min(1),
  executor_id: z.string().optional().nullable(),
  log_name: z.string().optional().nullable(),
  temperature: z.number().optional().nullable(),
  rh: z.number().optional().nullable(),
  tds: z.number().optional().nullable(),
  ph: z.number().optional().nullable(),
  hardness: z.number().optional().nullable(),
  chemical_dosing: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  entry_time: z.coerce.date().optional().nullable(),
  end_time: z.coerce.date().optional().nullable(),
  signature: z.string().optional().nullable(),
  attachment: z.string().optional().nullable(),
  task_line_id: z.string().optional().nullable(),
  log_id: z.string().optional().nullable(),
  sequence_no: z.string().optional().nullable(),
  scheduled_date: z.string().optional().nullable(),
  main_remarks: z.string().optional().nullable(),
  task_name: z.string().optional().nullable(),
  status: z.string().optional().default("Pending"),
});

export const updateSiteLogSchema = createSiteLogSchema
  .omit({ site_code: true })
  .partial();

/**
 * Chiller Reading Schemas
 */
export const createChillerReadingSchema = z.object({
  site_code: z.string().min(1),
  chiller_id: z.string().min(1).optional().nullable(),
  equipment_id: z.string().optional().nullable(),
  log_id: z.string().optional().nullable(),
  executor_id: z.string().min(1).optional().nullable(),
  reading_time: z.coerce.date().optional().nullable(),
  startdatetime: z.coerce.date().optional().nullable(),
  start_datetime: z.coerce.date().optional().nullable(),
  enddatetime: z.coerce.date().optional().nullable(),
  asset_name: z.string().optional().nullable(),
  asset_type: z.string().optional().nullable(),
  date_shift: z.string().optional().nullable(),
  compressor_load_percentage: z.number().optional().nullable(),
  compressor_load_percent: z.number().optional().nullable(),
  set_point_celsius: z.number().optional().nullable(),
  set_point: z.number().optional().nullable(),
  condenser_inlet_temp: z.number().optional().nullable(),
  condenser_outlet_temp: z.number().optional().nullable(),
  evaporator_inlet_temp: z.number().optional().nullable(),
  evaporator_outlet_temp: z.number().optional().nullable(),
  compressor_suction_temp: z.number().optional().nullable(),
  motor_temperature: z.number().optional().nullable(),
  saturated_condenser_temp: z.number().optional().nullable(),
  saturated_suction_temp: z.number().optional().nullable(),
  discharge_pressure: z.number().optional().nullable(),
  main_suction_pressure: z.number().optional().nullable(),
  oil_pressure: z.number().optional().nullable(),
  oil_pressure_difference: z.number().optional().nullable(),
  condenser_inlet_pressure: z.number().optional().nullable(),
  condenser_outlet_pressure: z.number().optional().nullable(),
  evaporator_inlet_pressure: z.number().optional().nullable(),
  evaporator_outlet_pressure: z.number().optional().nullable(),
  inline_btu_meter: z.number().optional().nullable(),
  status: z.string().optional().default("Pending"),
  remarks: z.string().optional().nullable(),
  reviewed_by: z.string().optional().nullable(),
  signature_text: z.string().optional().nullable(),
  attachments: z.string().optional().nullable(),
  sla_status: z.string().optional().nullable(),
  lastsync: z.coerce.date().optional().nullable(),
  deletedat: z.coerce.date().optional().nullable(),
  createdat: z.coerce.date().optional().nullable(),
  updatedat: z.coerce.date().optional().nullable(),
});

export const updateChillerReadingSchema = createChillerReadingSchema
  .omit({ site_code: true, chiller_id: true })
  .partial();

/**
 * PM Instance Schemas
 */
export const createPMInstanceSchema = z.object({
  instance_id: z.string().min(1),
  site_code: z.string().min(1),
  asset_id: z.string().optional().nullable(),
  maintenance_id: z.string().optional().nullable(),
  checklist_version: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  asset_type: z.string().optional().nullable(),
  floor: z.string().optional().nullable(),
  frequency: z.string().optional().nullable(),
  start_due_date: z.string().optional().nullable(),
  start_datetime: z.string().datetime().optional().nullable(),
  end_datetime: z.string().datetime().optional().nullable(),
  status: z.string().optional().default("Pending"),
  progress: z.string().optional().nullable(),
  estimated_duration: z.string().optional().nullable(),
  inventory_id: z.string().optional().nullable(),
  created_by: z.string().optional().nullable(),
  updated_by: z.string().optional().nullable(),
  assigned_to: z.string().optional().nullable(),
  teams: z.string().optional().nullable(),
  teams_name: z.string().optional().nullable(),
  assigned_to_name: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const updatePMInstanceSchema = createPMInstanceSchema
  .omit({ instance_id: true, site_code: true })
  .partial();

/**
 * Asset Schemas
 */
export const createAssetSchema = z.object({
  asset_id: z.string().min(1),
  // Acceptance of both site_id and site_code for flexibility
  site_id: z.string().optional(),
  site_code: z.string().optional(),
  asset_name: z.string().min(1),
  category: z.string().optional().nullable(),
  asset_type: z.string().optional().nullable(),
  status: z.string().optional().default("Active"),
  criticality: z.string().optional().nullable(),
  floor: z.string().optional().nullable(),
  warranty_start_date: z.string().optional().nullable(),
  warranty_end_date: z.string().optional().nullable(),
  vendor_id: z.string().optional().nullable(),
  qr_id: z.string().optional().nullable(),
  equipment_type: z.string().optional().nullable(),
  area_floor_id: z.string().optional().nullable(),
  area_type: z.string().optional().nullable(),
});

export const updateAssetSchema = createAssetSchema.partial().omit({ asset_id: true });

/**
 * Auth Schemas
 */
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(6),
});

/**
 * Ticket/Complaint Schemas
 */
export const createComplaintSchema = z.object({
  ticket_no: z.string().optional(),
  site_code: z.string().min(1), // Relaxed from UUID since it can be alphanumeric code
  title: z.string().min(1),
  status: z.string().optional().default("Open"),
  priority: z.string().optional().default("Medium"),
  category: z.string().optional(),
  location: z.string().optional(),
  area_asset: z.string().optional(),
  created_user: z.string().optional(),
  message_id: z.string().optional(),
  sender_id: z.string().optional(),
  group_id: z.string().optional(),
  internal_remarks: z.string().optional(),
  customer_inputs: z.string().optional(),
  notes: z.string().optional(),
  contact_name: z.string().optional(),
  contact_number: z.string().optional(),
  current_temperature: z.number().optional().nullable(),
  current_rh: z.number().optional().nullable(),
  standard_temperature: z.number().optional().nullable(),
  standard_rh: z.number().optional().nullable(),
  spare_type: z.string().optional().nullable(),
  spare_quantity: z.number().optional().nullable(),
  start_datetime: z.string().datetime().optional().nullable(),
  end_datetime: z.string().datetime().optional().nullable(),
  responded_at: z.string().datetime().optional().nullable(),
  resolved_at: z.string().datetime().optional().nullable(),
  before_temp: z.number().optional().nullable(),
  after_temp: z.number().optional().nullable(),
  flag_incident: z.boolean().optional().default(false),
  assigned_to: z.string().optional().nullable(),
  escalation_source: z.string().optional().nullable(),
  sub_ticket_id: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
  support_users: z.string().optional().nullable(), // Store as stringified JSON if needed
  support_users_name: z.string().optional().nullable(),
  attachments: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

export const updateComplaintSchema = createComplaintSchema
  .omit({
    ticket_no: true,
    site_code: true,
  })
  .partial();

export const updateComplaintStatusSchema = z.object({
  status: z.string().min(1),
  remarks: z.string().optional(),
});

/**
 * Attendance Schemas
 */
export const attendanceSchema = z.object({
  user_id: z.string().min(1),
  site_code: z.string().min(1),
  date: z.string().optional(),
  check_in_time: z.string().datetime().optional().nullable(),
  check_out_time: z.string().datetime().optional().nullable(),
  check_in_latitude: z.number().optional().nullable(),
  check_in_longitude: z.number().optional().nullable(),
  check_out_latitude: z.number().optional().nullable(),
  check_out_longitude: z.number().optional().nullable(),
  check_in_address: z.string().optional().nullable(),
  check_out_address: z.string().optional().nullable(),
  shift_id: z.string().optional().nullable(),
  status: z.string().optional().default("Present"),
  remarks: z.string().optional().nullable(),
});
