const OPTIONAL_REPORTING_COLUMNS = [
  "daily_report_email",
  "weekly_report_email",
];

function getErrorMessage(error) {
  return String(error?.message || error || "");
}

function isMissingColumnError(error, columnName) {
  return getErrorMessage(error).includes(`'${columnName}' column`);
}

function stripOptionalReportingColumns(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key, value]) =>
        value !== undefined && !OPTIONAL_REPORTING_COLUMNS.includes(key)
    )
  );
}

export async function safeUpsertClientSettings(
  supabase,
  payload = {},
  options = { onConflict: "client_id" }
) {
  if (!supabase) {
    return { error: null, degraded: false };
  }

  const cleanPayload = Object.fromEntries(
    Object.entries(payload || {}).filter(([, value]) => value !== undefined)
  );

  if (Object.keys(cleanPayload).length === 0) {
    return { error: null, degraded: false };
  }

  const firstAttempt = await supabase
    .from("client_settings")
    .upsert(cleanPayload, options);

  if (!firstAttempt.error) {
    return { error: null, degraded: false };
  }

  const hasOptionalColumnFailure = OPTIONAL_REPORTING_COLUMNS.some((column) =>
    isMissingColumnError(firstAttempt.error, column)
  );

  if (!hasOptionalColumnFailure) {
    return { error: firstAttempt.error, degraded: false };
  }

  const fallbackPayload = stripOptionalReportingColumns(cleanPayload);

  if (Object.keys(fallbackPayload).length === 0) {
    return { error: null, degraded: true };
  }

  const fallbackAttempt = await supabase
    .from("client_settings")
    .upsert(fallbackPayload, options);

  return {
    error: fallbackAttempt.error || null,
    degraded: !fallbackAttempt.error,
  };
}

export async function safeLoadClientSettings(supabase, clientId) {
  if (!supabase || !clientId) {
    return { data: null, error: null };
  }

  const response = await supabase
    .from("client_settings")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();

  return {
    data: response.data || null,
    error: response.error || null,
  };
}
