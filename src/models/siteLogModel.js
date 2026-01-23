export const formatSiteLogForInsert = (data) => {
  return {
    site_id: data.site_id,
    executor_id: data.executor_id,
    log_name: data.log_name,
    temperature: data.temperature || null,
    rh: data.rh || null,
    tds: data.tds || null,
    ph: data.ph || null,
    hardness: data.hardness || null,
    chemical_dosing: data.chemical_dosing || null,
    remarks: data.remarks || null,
    entry_time: data.entry_time || null,
    end_time: data.end_time || null,
    signature: data.signature || null,
    attachment: data.attachment || null,
    updated_at: new Date().toISOString(),
  };
};
