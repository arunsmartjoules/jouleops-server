-- Create WhatsApp Group Mappings table
CREATE TABLE IF NOT EXISTS whatsapp_group_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id TEXT NOT NULL UNIQUE, -- site_code
    site_name TEXT,
    whatsapp_group_id TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create WhatsApp Message Templates table
CREATE TABLE IF NOT EXISTS whatsapp_message_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_key TEXT NOT NULL UNIQUE, -- e.g. 'ticket_status_update'
    template_name TEXT NOT NULL,
    template_content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create WhatsApp Message Logs table
CREATE TABLE IF NOT EXISTS whatsapp_message_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID,
    ticket_no TEXT,
    site_id TEXT,
    group_id TEXT,
    message_content TEXT,
    status TEXT, -- 'sent', 'failed', 'simulated', 'error'
    whapi_response JSONB,
    error_message TEXT,
    sent_by TEXT, -- email or user_id
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Initial Templates
INSERT INTO whatsapp_message_templates (template_key, template_name, template_content)
VALUES (
    'ticket_status_update',
    'Ticket Status Update Notification',
    '📢 *Ticket Status Update*\n\n*Ticket:* {{ticket_no}}\n*Title:* {{title}}\n*Site:* {{site_name}}\n*New Status:* {{status}}\n\n*Updated By:* {{updated_by}}\n*Time:* {{timestamp}}\n\n_This is an automated notification from Smart Ops._'
) ON CONFLICT (template_key) DO NOTHING;
