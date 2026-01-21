import supabase from "./src/config/supabase.js";

async function checkTables() {
  const tables = [
    "whatsapp_group_mappings",
    "whatsapp_message_templates",
    "whatsapp_message_logs",
  ];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      console.log(`Table ${table} check failed: ${error.message}`);
    } else {
      console.log(`Table ${table} exists.`);
    }
  }
}

checkTables();
