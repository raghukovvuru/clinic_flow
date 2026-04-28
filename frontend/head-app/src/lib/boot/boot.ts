import type { ArrivalCounterBoot, ArrivalRealtimeMode } from "$arrival/types";

declare global {
  interface Window {
    clinicFlowBoot?: unknown;
  }
}

let cachedBoot: ArrivalCounterBoot | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRealtimeMode(value: unknown): value is ArrivalRealtimeMode {
  return value === "frappe" || value === "polling" || value === "disabled";
}

export function parseArrivalCounterBoot(raw: unknown): ArrivalCounterBoot {
  if (!isRecord(raw)) throw new Error("Arrival Counter boot data is missing");

  const realtime = raw.realtime;
  const permissions = raw.permissions;
  if (!isRecord(realtime) || !isRecord(permissions)) {
    throw new Error("Arrival Counter boot data is invalid");
  }

  const boot = {
    app: raw.app,
    slice: raw.slice,
    route: raw.route,
    siteName: raw.siteName,
    user: raw.user,
    roles: raw.roles,
    csrfToken: raw.csrfToken,
    realtime,
    permissions,
  };

  const valid =
    boot.app === "clinic_flow" &&
    boot.slice === "arrival-counter" &&
    boot.route === "/clinic/arrival-counter" &&
    typeof boot.siteName === "string" &&
    boot.siteName.length > 0 &&
    typeof boot.user === "string" &&
    boot.user.length > 0 &&
    isStringArray(boot.roles) &&
    typeof boot.csrfToken === "string" &&
    boot.csrfToken.length > 0 &&
    typeof realtime.enabled === "boolean" &&
    isRealtimeMode(realtime.mode) &&
    typeof permissions.canUseArrivalCounter === "boolean" &&
    typeof permissions.canConfirmArrival === "boolean" &&
    typeof permissions.canPrintTokenSlip === "boolean";

  if (!valid) throw new Error("Arrival Counter boot data is invalid");
  if (!permissions.canUseArrivalCounter) throw new Error("Arrival Counter access is not permitted");

  return boot as ArrivalCounterBoot;
}

export function getClinicFlowBoot(): ArrivalCounterBoot {
  if (!cachedBoot) cachedBoot = parseArrivalCounterBoot(window.clinicFlowBoot);
  return cachedBoot;
}

export function resetBootForTests() {
  cachedBoot = null;
}
