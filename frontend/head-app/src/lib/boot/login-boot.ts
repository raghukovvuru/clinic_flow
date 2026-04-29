import type { LoginBoot, LoginMode } from "$login/types";

declare global {
  interface Window {
    clinicFlowBoot?: unknown;
  }
}

let cachedBoot: LoginBoot | null = null;

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isLoginMode(value: unknown): value is LoginMode {
  return value === "login" || value === "access-denied";
}

export function parseLoginBoot(raw: unknown): LoginBoot {
  if (!raw || typeof raw !== "object") {
    throw new Error("Login boot data is missing");
  }

  const r = raw as Record<string, unknown>;

  const valid =
    r.app === "clinic_flow" &&
    r.slice === "login" &&
    r.route === "/clinic/login" &&
    isString(r.siteName) &&
    isString(r.csrfToken) &&
    isString(r.redirectUrl) &&
    isLoginMode(r.mode) &&
    isStringArray(r.requiredRoles);

  if (!valid) {
    throw new Error("Login boot data is invalid");
  }

  return {
    app: "clinic_flow",
    slice: "login",
    route: "/clinic/login",
    siteName: r.siteName as string,
    csrfToken: r.csrfToken as string,
    redirectUrl: r.redirectUrl as string,
    mode: r.mode as LoginMode,
    requiredRoles: r.requiredRoles as string[],
    currentUser: typeof r.currentUser === "string" ? r.currentUser : null,
  };
}

export function getLoginBoot(): LoginBoot {
  if (!cachedBoot) {
    cachedBoot = parseLoginBoot(window.clinicFlowBoot);
  }
  return cachedBoot;
}

export function resetLoginBootForTests(): void {
  cachedBoot = null;
}
