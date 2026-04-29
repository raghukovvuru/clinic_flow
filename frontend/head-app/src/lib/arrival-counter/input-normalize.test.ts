import { describe, expect, it } from "vitest";
import { normalizePhoneInput, sanitizeScannerPayload } from "$arrival/input-normalize";

describe("arrival input normalization", () => {
  it("normalizes common phone formats to digits", () => {
    expect(normalizePhoneInput("+91 98765-43210")).toBe("919876543210");
    expect(normalizePhoneInput("(98765) 43210")).toBe("9876543210");
    expect(normalizePhoneInput("98765 43210")).toBe("9876543210");
  });

  it("keeps short digit inputs available for classifier rejection", () => {
    expect(normalizePhoneInput("12345")).toBe("12345");
  });

  it("sanitizes scanner whitespace and common text wrappers", () => {
    expect(sanitizeScannerPayload("\n QE-2026-123 \r")).toBe("QE-2026-123");
    expect(sanitizeScannerPayload("queue_entry:QE-2026-123")).toBe("QE-2026-123");
    expect(sanitizeScannerPayload("QUEUE_ENTRY=QE-2026-123")).toBe("QE-2026-123");
  });
});
