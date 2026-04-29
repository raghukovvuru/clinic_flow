import { describe, expect, it } from "vitest";
import { classifyInput } from "$arrival/classify";

describe("classifyInput", () => {
  it("detects queue-entry QR input", () => {
    expect(classifyInput("qe-2026-12")).toEqual({ mode: "qr_code", value: "QE-2026-12" });
  });

  it("detects phone input with normalization", () => {
    expect(classifyInput("+251 911 123456")).toEqual({ mode: "phone", value: "251911123456" });
  });

  it("detects name input", () => {
    expect(classifyInput("Mimi")).toEqual({ mode: "name_query", value: "Mimi" });
  });

  it("rejects too-short input", () => {
    expect(classifyInput("ab")).toBeNull();
  });

  it("rejects empty input", () => {
    expect(classifyInput("")).toBeNull();
  });

  it("classifies mixed-format phone input using normalized digits", () => {
    expect(classifyInput("+91 98765-43210")).toEqual({ mode: "phone", value: "919876543210" });
  });

  it("classifies wrapped scanner queue entry payload as qr code", () => {
    expect(classifyInput("queue_entry:QE-2026-123")).toEqual({ mode: "qr_code", value: "QE-2026-123" });
  });
});
