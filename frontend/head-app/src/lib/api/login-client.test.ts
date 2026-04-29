import { describe, it, expect, beforeEach, vi } from "vitest";
import { clinicLogin } from "./login-client";
import { resetLoginBootForTests } from "$lib/boot/login-boot";

const validBoot = {
  app: "clinic_flow",
  slice: "login",
  route: "/clinic/login",
  siteName: "site1.localhost",
  csrfToken: "login-csrf-token",
  redirectUrl: "/clinic/arrival-counter",
  mode: "login" as const,
  requiredRoles: ["Healthcare Administrator", "Queue Manager", "System Manager"],
  currentUser: null,
};

beforeEach(() => {
  resetLoginBootForTests();
  (window as typeof window & { clinicFlowBoot?: unknown }).clinicFlowBoot = validBoot;
});

describe("clinicLogin", () => {
  it("sends credentials to /api/method/login", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ message: "Logged In" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await clinicLogin("user@example.com", "password123");

    expect(result.success).toBe(true);
    expect(result.redirectUrl).toBe("/clinic/arrival-counter");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/method/login",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      })
    );

    vi.restoreAllMocks();
  });

  it("returns error on invalid credentials", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ message: "Invalid login credentials" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await clinicLogin("wrong@example.com", "wrong");

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe("invalid_credentials");

    vi.restoreAllMocks();
  });

  it("returns network error on fetch failure", async () => {
    vi.stubGlobal("fetch", () => { throw new Error("Network error"); });

    const result = await clinicLogin("user@example.com", "password123");

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe("network");

    vi.restoreAllMocks();
  });

  it("maps password reset response to forgot mode signal", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ message: "Password Reset" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await clinicLogin("user@example.com", "password123");

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe("password_reset_required");

    vi.restoreAllMocks();
  });
});
