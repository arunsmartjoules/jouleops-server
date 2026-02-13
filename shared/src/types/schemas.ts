import { z } from "zod";

/**
 * Site Log Schemas
 */
export const createSiteLogSchema = z.object({
  site_id: z.string().uuid(),
  log_name: z.string().min(1),
  log_value: z.string().optional(),
  unit: z.string().optional(),
  executor_id: z.string().uuid(),
  status: z
    .enum(["Pending", "In Progress", "Completed", "Cancelled"])
    .optional()
    .default("Pending"),
  remarks: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateSiteLogSchema = createSiteLogSchema
  .omit({ site_id: true })
  .partial();

/**
 * Chiller Reading Schemas
 */
export const createChillerReadingSchema = z.object({
  site_id: z.string().uuid(),
  chiller_id: z.string().uuid(),
  reading_time: z.string().datetime().optional(),
  evaporator_inlet_temp: z.number().optional(),
  evaporator_outlet_temp: z.number().optional(),
  condenser_inlet_temp: z.number().optional(),
  condenser_outlet_temp: z.number().optional(),
  evaporator_pressure: z.number().optional(),
  condenser_pressure: z.number().optional(),
  compressor_load_percentage: z.number().min(0).max(100).optional(),
  power_consumption_kw: z.number().optional(),
  status: z
    .enum(["Pending", "In Progress", "Completed", "Cancelled"])
    .optional()
    .default("Pending"),
  remarks: z.string().optional(),
  executor_id: z.string().uuid(),
});

export const updateChillerReadingSchema = createChillerReadingSchema
  .omit({ site_id: true, chiller_id: true })
  .partial();

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
  ticket_id: z.string().uuid(),
  ticket_no: z.string().min(1),
  site_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional().default("Open"),
  priority: z
    .enum(["Low", "Medium", "High", "Critical"])
    .optional()
    .default("Medium"),
  message_id: z.string().optional(),
  group_id: z.string().optional(),
  reported_by: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
});

export const updateComplaintSchema = createComplaintSchema
  .omit({
    ticket_id: true,
    ticket_no: true,
    site_id: true,
  })
  .partial();

export const updateComplaintStatusSchema = z.object({
  status: z.string().min(1),
  remarks: z.string().optional(),
});
