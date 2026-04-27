import type { SearchMode } from "$arrival/types";

export function classifyInput(raw: string): { mode: SearchMode; value: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^QE-\d{4}-\d+$/i.test(trimmed)) {
    return { mode: "qr_code", value: trimmed.toUpperCase() };
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length >= 6 && /^[\d\s+\-()]+$/.test(trimmed)) {
    return { mode: "phone", value: trimmed };
  }

  if (trimmed.replace(/\d/g, "").length >= 3) {
    return { mode: "name_query", value: trimmed };
  }

  return null;
}
