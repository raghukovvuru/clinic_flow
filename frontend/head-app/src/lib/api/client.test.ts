import { beforeEach, describe, expect, it, vi } from "vitest";
import { callFrappe, FrappeClientError } from "./client";
import { resetBootForTests } from "$lib/boot/boot";

const boot = {
  app: "clinic_flow",
  slice: "arrival-counter",
  route: "/clinic/arrival-counter",
  siteName: "site1.localhost",
  user: "staff@example.com",
  roles: ["Queue Manager"],
  csrfToken: "boot-csrf-token",
  realtime: { enabled: false, mode: "polling" },
  permissions: {
    canUseArrivalCounter: true,
    canConfirmArrival: true,
    canPrintTokenSlip: true,
  },
};

describe("callFrappe", () => {
  beforeEach(() => {
    resetBootForTests();
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = boot;
    vi.restoreAllMocks();
  });

  it("sends the boot CSRF token, not window.frappe", async () => {
    (window as typeof window & { frappe?: { csrf_token?: string } }).frappe = { csrf_token: "wrong-token" };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ message: { ok: true } }), { status: 200 }));

    await callFrappe<{ ok: boolean }>("clinic_flow.api.arrival.get_arrival_session_context", {});

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["X-Frappe-CSRF-Token"]).toBe("boot-csrf-token");
  });

  it("normalizes forbidden responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ exc_type: "PermissionError" }), { status: 403 }));

    await expect(callFrappe("clinic_flow.api.arrival.get_arrival_session_context", {})).rejects.toMatchObject({
      category: "forbidden",
      status: 403,
    });
  });

  it("normalizes validation responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ _server_messages: '[{"message":"Phone is too short"}]' }), { status: 417 }));

    await expect(callFrappe("clinic_flow.api.arrival.lookup_arrival_candidate", {})).rejects.toMatchObject({
      category: "validation",
      message: "Phone is too short",
    });
  });
});
