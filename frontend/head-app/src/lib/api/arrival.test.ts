import { beforeEach, describe, expect, it, vi } from "vitest";
import { getArrivalSessionContext, lookupArrivalCandidate, markArrived } from "./arrival";
import { resetBootForTests } from "$lib/boot/boot";

const boot = {
  app: "clinic_flow",
  slice: "arrival-counter",
  route: "/clinic/arrival-counter",
  siteName: "site1.localhost",
  user: "staff@example.com",
  roles: ["Queue Manager"],
  csrfToken: "csrf",
  realtime: { enabled: false, mode: "polling" },
  permissions: { canUseArrivalCounter: true, canConfirmArrival: true, canPrintTokenSlip: true },
};

function mockMessage(message: unknown) {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ message }), { status: 200 }));
}

describe("arrival API validation", () => {
  beforeEach(() => {
    resetBootForTests();
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = boot;
    vi.restoreAllMocks();
  });

  it("rejects invalid session context", async () => {
    mockMessage({ has_active: true });
    await expect(getArrivalSessionContext()).rejects.toThrow("Arrival session context response is invalid");
  });

  it("accepts valid empty session context", async () => {
    mockMessage({ has_active: false, stats: { arrived: 0, awaiting_arrival: 0 }, current_session: null, next_session: null, recent_arrivals: [] });
    await expect(getArrivalSessionContext()).resolves.toMatchObject({ has_active: false });
  });

  it("rejects invalid lookup candidates", async () => {
    mockMessage({ candidates: [{ queue_entry: "QE-1" }] });
    await expect(lookupArrivalCandidate({ qr_code: "QE-1" })).rejects.toThrow("Arrival candidate response is invalid");
  });

  it("rejects invalid mutation payload", async () => {
    mockMessage({ status: "Arrived", already_arrived: false });
    await expect(markArrived("QE-1")).rejects.toThrow("Arrival mutation response is invalid");
  });
});
