-- Add indices to site_code columns for performance optimization
-- Part of the site_code migration project

BEGIN;

-- Core Tables (High Traffic)
CREATE INDEX IF NOT EXISTS idx_complaints_site_code ON complaints(site_code);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_site_code ON attendance_logs(site_code);
CREATE INDEX IF NOT EXISTS idx_pm_instances_site_code ON pm_instances(site_code);
CREATE INDEX IF NOT EXISTS idx_chiller_readings_site_code ON chiller_readings(site_code);
CREATE INDEX IF NOT EXISTS idx_site_logs_site_code ON site_logs(site_code);

-- Other Tables
CREATE INDEX IF NOT EXISTS idx_assets_site_code ON assets(site_code);
CREATE INDEX IF NOT EXISTS idx_users_site_code ON users(site_code);
CREATE INDEX IF NOT EXISTS idx_tasks_site_code ON tasks(site_code);
CREATE INDEX IF NOT EXISTS idx_whatsapp_group_mappings_site_code ON whatsapp_group_mappings(site_code);

COMMIT;
