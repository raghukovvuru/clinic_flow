import { beforeEach, describe, expect, it } from "vitest";
import { getClinicFlowBoot, resetBootForTests } from "./boot";

const validBoot = {
  app: "clinic_flow",
  slice: "arrival-counter",
  route: "/clinic/arrival-counter",
  siteName: "site1.localhost",
  user: "staff@example.com",
  roles: ["Queue Manager"],
  csrfToken: "csrf-123",
  realtime: { enabled: false, mode: "polling" },
  permissions: {
    canUseArrivalCounter: true,
    canConfirmArrival: true,
    canPrintTokenSlip: true,
  },
};

describe("getClinicFlowBoot", () => {
  beforeEach(() => {
    resetBootForTests();
    delete (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot;
  });

  it("returns a valid boot object", () => {
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = validBoot;
    expect(getClinicFlowBoot().csrfToken).toBe("csrf-123");
  });

  it("rejects a missing boot object", () => {
    expect(() => getClinicFlowBoot()).toThrow("Arrival Counter boot data is missing");
  });

  it("rejects the wrong slice", () => {
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = { ...validBoot, slice: "other" };
    expect(() => getClinicFlowBoot()).toThrow("Arrival Counter boot data is invalid");
  });

  it("rejects a missing CSRF token", () => {
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = { ...validBoot, csrfToken: "" };
    expect(() => getClinicFlowBoot()).toThrow("Arrival Counter boot data is invalid");
  });

  it("rejects route permission denial", () => {
    (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = {
      ...validBoot,
      permissions: { ...validBoot.permissions, canUseArrivalCounter: false },
    };
    expect(() => getClinicFlowBoot()).toThrow("Arrival Counter access is not permitted");
  });
});
