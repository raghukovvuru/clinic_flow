import { getClinicFlowBoot } from "$lib/boot/boot";
import type { ArrivalClientErrorShape, ArrivalErrorCategory } from "$arrival/types";

type FrappeErrorPayload = {
  exc_type?: string;
  exception?: string;
  _server_messages?: string;
  message?: unknown;
};

export class FrappeClientError extends Error implements ArrivalClientErrorShape {
  category: ArrivalErrorCategory;
  status: number;

  constructor(shape: ArrivalClientErrorShape) {
    super(shape.message);
    this.name = "FrappeClientError";
    this.category = shape.category;
    this.status = shape.status;
  }
}

function categoryFromStatus(status: number, payload: FrappeErrorPayload): ArrivalErrorCategory {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 417) return payload.exc_type === "CSRFTokenError" ? "csrf" : "validation";
  return "unknown";
}

function messageFromPayload(payload: FrappeErrorPayload, fallback: string): string {
  if (typeof payload._server_messages === "string") {
    try {
      const parsed = JSON.parse(payload._server_messages) as Array<{ message?: string }>;
      const message = parsed.find((item) => typeof item.message === "string")?.message;
      if (message) return message.replace(/<[^>]*>/g, "");
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function readJson(response: Response): Promise<FrappeErrorPayload> {
  try {
    return (await response.json()) as FrappeErrorPayload;
  } catch {
    return {};
  }
}

export async function callFrappe<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const boot = getClinicFlowBoot();
  let response: Response;

  try {
    response = await fetch(`/api/method/${method}`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Frappe-CSRF-Token": boot.csrfToken,
      },
      credentials: "same-origin",
      body: JSON.stringify(args),
    });
  } catch {
    throw new FrappeClientError({ category: "network", status: 0, message: "Network connection failed. Retry when the connection is stable." });
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const category = categoryFromStatus(response.status, payload);
    throw new FrappeClientError({
      category,
      status: response.status,
      message: messageFromPayload(payload, category === "forbidden" ? "Access denied for Arrival Counter." : "Request failed. Try again."),
    });
  }

  if (!("message" in payload)) {
    throw new FrappeClientError({ category: "unknown", status: response.status, message: "Server response was incomplete. Refresh and try again." });
  }

  return payload.message as T;
}
