-- Ultra-comprehensive migration script with CASCADE and NOT VALID FKs

BEGIN;

-- 1. Safely drop all constraints involving site_id using CASCADE
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT DISTINCT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
        WHERE kcu.column_name = 'site_id'
    ) LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I CASCADE', r.table_name, r.constraint_name);
    END LOOP;

    FOR r IN (
        SELECT constraint_name 
        FROM information_schema.constraint_column_usage 
        WHERE table_name = 'sites' AND column_name = 'site_id'
    ) LOOP
        EXECUTE format('ALTER TABLE sites DROP CONSTRAINT IF EXISTS %I CASCADE', r.constraint_name);
    END LOOP;
END $$;

-- 2. Data Cleanup for known mapping issues
UPDATE complaints SET site_id = 'JCL-KABLR-KIMSBLR' WHERE site_id = 'JCL-KIMSBANGALORE';
UPDATE complaints SET site_id = 'JCL-TLHYD-SUNSHINE' WHERE site_id = 'JCL-SUNSHINE';

-- 3. Update site_id values to site_code across all tables
DO $$
DECLARE
    t_name text;
    tables text[] := ARRAY[
        'attendance_logs', 'chiller_readings', 'complaints', 
        'groups', 'pm_checklist', 'pm_instances', 'shifts', 
        'site_logs', 'site_user', 'tasks', 'teams', 
        'user_site_mappings', 'users', 'assets', 'whatsapp_group_mappings'
    ];
BEGIN
    FOREACH t_name IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t_name) THEN
            EXECUTE format('
                UPDATE %I t
                SET site_id = s.site_code
                FROM sites s
                WHERE t.site_id = s.site_id AND t.site_id != s.site_code
            ', t_name);
        END IF;
    END LOOP;
END $$;

-- 4. Resolve duplicates in site_user and user_site_mappings
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'site_user') THEN
        DELETE FROM site_user a USING site_user b
        WHERE a.user_id = b.user_id AND a.site_id = b.site_id AND a.ctid < b.ctid;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_site_mappings') THEN
        DELETE FROM user_site_mappings a USING user_site_mappings b
        WHERE a.user_id = b.user_id AND a.site_id = b.site_id AND a.ctid < b.ctid;
    END IF;
END $$;

-- 5. Cleanup sites table
ALTER TABLE sites DROP COLUMN IF EXISTS site_id CASCADE;

-- 6. Ensure site_code is unique and indexed in sites
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_site_code_unique') THEN
        ALTER TABLE sites ADD CONSTRAINT sites_site_code_unique UNIQUE (site_code);
    END IF;
END $$;

-- 7. Rename site_id columns to site_code in all tables
DO $$
DECLARE
    t_name text;
    tables text[] := ARRAY[
        'attendance_logs', 'complaints', 'chiller_readings',
        'groups', 'pm_checklist', 'pm_instances', 'shifts', 
        'site_logs', 'site_user', 'tasks', 'teams', 
        'user_site_mappings', 'users', 'assets', 'whatsapp_group_mappings'
    ];
BEGIN
    FOREACH t_name IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t_name AND column_name = 'site_id') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t_name AND column_name = 'site_code') THEN
                EXECUTE format('ALTER TABLE %I RENAME COLUMN site_id TO site_code', t_name);
            ELSE
                EXECUTE format('ALTER TABLE %I DROP COLUMN site_id CASCADE', t_name);
            END IF;
        END IF;
    END LOOP;
END $$;

-- 8. Re-create Primary Keys and Unique Constraints
DO $$
BEGIN
    -- site_user
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'site_user') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'site_user' AND constraint_type = 'PRIMARY KEY') THEN
            ALTER TABLE site_user ADD PRIMARY KEY (user_id, site_code);
        END IF;
    END IF;
    -- user_site_mappings
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_site_mappings') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name = 'user_site_mappings' AND constraint_type = 'UNIQUE' AND constraint_name = 'user_site_mappings_user_id_site_code_key') THEN
            ALTER TABLE user_site_mappings ADD CONSTRAINT user_site_mappings_user_id_site_code_key UNIQUE (user_id, site_code);
        END IF;
    END IF;
END $$;

-- 9. Re-create foreign keys pointing to sites.site_code (USE NOT VALID FOR ALL)
DO $$
DECLARE
    t_name text;
    c_name text;
    fks text[][] := ARRAY[
        ['attendance_logs', 'attendance_logs_site_code_fkey'],
        ['chiller_readings', 'chiller_readings_site_code_fkey'],
        ['complaints', 'complaints_site_code_fkey'],
        ['groups', 'groups_site_code_fkey'],
        ['pm_checklist', 'pm_checklist_site_code_fkey'],
        ['pm_instances', 'pm_instances_site_code_fkey'],
        ['shifts', 'shifts_site_code_fkey'],
        ['site_logs', 'site_code_fkey'],
        ['site_user', 'site_user_site_code_fkey'],
        ['tasks', 'tasks_site_code_fkey'],
        ['teams', 'teams_site_code_fkey'],
        ['user_site_mappings', 'user_site_mappings_site_code_fkey'],
        ['users', 'users_site_code_fkey'],
        ['whatsapp_group_mappings', 'whatsapp_group_mappings_site_code_fkey']
    ];
BEGIN
    FOR i IN 1..array_length(fks, 1) LOOP
        t_name := fks[i][1];
        c_name := fks[i][2];
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t_name) AND
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t_name AND column_name = 'site_code') THEN
            EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (site_code) REFERENCES sites(site_code) NOT VALID', t_name, c_name);
        END IF;
    END LOOP;
END $$;

COMMIT;
