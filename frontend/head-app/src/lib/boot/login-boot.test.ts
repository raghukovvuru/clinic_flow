import { describe, it, expect, beforeEach } from "vitest";
import { parseLoginBoot, resetLoginBootForTests } from "./login-boot";

const validBoot = {
  app: "clinic_flow",
  slice: "login",
  route: "/clinic/login",
  siteName: "site1.localhost",
  csrfToken: "csrf-123",
  redirectUrl: "/clinic/arrival-counter",
  mode: "login" as const,
  requiredRoles: ["Healthcare Administrator", "Queue Manager", "System Manager"],
  currentUser: null,
};

beforeEach(() => {
  resetLoginBootForTests();
  delete (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot;
});

describe("parseLoginBoot", () => {
  it("returns a valid boot object", () => {
    const boot = parseLoginBoot(validBoot);
    expect(boot.csrfToken).toBe("csrf-123");
    expect(boot.mode).toBe("login");
    expect(boot.redirectUrl).toBe("/clinic/arrival-counter");
  });

  it("rejects a missing boot object", () => {
    expect(() => parseLoginBoot(undefined)).toThrow("missing");
  });

  it("rejects an invalid slice", () => {
    expect(() => parseLoginBoot({ ...validBoot, slice: "other" })).toThrow("invalid");
  });

  it("rejects an empty csrfToken", () => {
    expect(() => parseLoginBoot({ ...validBoot, csrfToken: "" })).toThrow("invalid");
  });

  it("accepts access-denied mode with currentUser", () => {
    const boot = parseLoginBoot({
      ...validBoot,
      mode: "access-denied",
      currentUser: "user@example.com",
    });
    expect(boot.mode).toBe("access-denied");
    expect(boot.currentUser).toBe("user@example.com");
  });
});
