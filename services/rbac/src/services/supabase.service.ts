import { createClient } from "@supabase/supabase-js";
import { logger } from "@jouleops/shared";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  logger.error("Supabase environment variables are missing!", {
    module: "SUPABASE_SERVICE",
    url: !!supabaseUrl,
    key: !!supabaseAnonKey,
  });
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
