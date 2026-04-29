export function normalizePhoneInput(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export function sanitizeScannerPayload(raw: string): string {
  const trimmed = raw.trim();
  const wrapped = trimmed.match(/^(?:queue_entry|qe|token)\s*[:=]\s*(QE-\d{4}-\d+)$/i);
  return wrapped ? wrapped[1].toUpperCase() : trimmed;
}
