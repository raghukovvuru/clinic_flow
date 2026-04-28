import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildTokenSlipDocument, printTokenSlip } from "./print-slip";
import type { ArrivalCardRecord } from "./types";

const record: ArrivalCardRecord = {
  name: "QE-1",
  queue_entry: "QE-1",
  display_token: "OPD-001",
  patient_name: "<img src=x onerror=alert(1)>",
  queue_session: "QS-1",
  status: "Arrived",
  state_label: "Already Arrived",
  visit_label: "New Patient",
  print_context: {
    queue_entry: "QE-1",
    display_token: "OPD-001<script>alert(1)</script>",
    patient_name: "<img src=x onerror=alert(1)>",
    qr_svg: "<svg viewBox=\"0 0 1 1\"></svg>",
  },
};

describe("print slip", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("escapes patient-controlled text", () => {
    const doc = document.implementation.createHTMLDocument("print");
    buildTokenSlipDocument(doc, record);

    expect(doc.body.textContent).toContain("OPD-001<script>alert(1)</script>");
    expect(doc.body.innerHTML).not.toContain("<img");
    expect(doc.body.querySelector("img")).toBeNull();
  });

  it("does not use document.write", () => {
    const doc = document.implementation.createHTMLDocument("print");
    const writeSpy = vi.spyOn(doc, "write");
    buildTokenSlipDocument(doc, record);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("reports popup failure", () => {
    vi.spyOn(window, "open").mockReturnValueOnce(null);
    expect(printTokenSlip(record)).toEqual({ ok: false, reason: "popup-blocked" });
  });
});
