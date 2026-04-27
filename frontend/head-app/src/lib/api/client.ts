import { browser } from "$app/environment";

export async function callFrappe<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const csrfToken = browser
    ? (window as unknown as { frappe?: { csrf_token?: string } }).frappe?.csrf_token ?? ""
    : "";

  const response = await fetch(`/api/method/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Frappe-CSRF-Token": csrfToken as string,
    },
    credentials: "same-origin",
    body: JSON.stringify(args),
  });

  if (!response.ok) {
    throw new Error(`Frappe request failed: ${response.status}`);
  }

  const payload = (await response.json()) as { message: T };
  return payload.message;
}
