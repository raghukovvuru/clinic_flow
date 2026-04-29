import type { SearchMode } from "$arrival/types";
import { normalizePhoneInput, sanitizeScannerPayload } from "$arrival/input-normalize";

export function classifyInput(raw: string): { mode: SearchMode; value: string } | null {
  const trimmed = sanitizeScannerPayload(raw);
  if (!trimmed) return null;

  if (/^QE-\d{4}-\d+$/i.test(trimmed)) {
    return { mode: "qr_code", value: trimmed.toUpperCase() };
  }

  const digits = normalizePhoneInput(trimmed);
  if (digits.length >= 6 && /^[\d\s+\-()]+$/.test(trimmed)) {
    return { mode: "phone", value: digits };
  }

  if (trimmed.replace(/\d/g, "").length >= 3) {
    return { mode: "name_query", value: trimmed };
  }

  return null;
}
