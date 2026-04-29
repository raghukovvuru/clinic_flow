import { getLoginBoot } from "$lib/boot/login-boot";
import type { LoginError } from "$login/types";

export interface LoginResult {
  success: boolean;
  redirectUrl?: string;
  error?: LoginError;
}

function categorizeError(status: number, message: string): LoginError {
  if (status === 401) {
    return { type: "invalid_credentials", message: "Invalid email or password." };
  }
  if (status === 403 && message.toLowerCase().includes("disabled")) {
    return { type: "account_disabled", message: "This account has been disabled." };
  }
  if (status === 429) {
    return { type: "rate_limited", message: "Too many login attempts. Please try again in a few minutes." };
  }
  return { type: "unknown", message: message || "Login failed. Please try again." };
}

export async function clinicLogin(usr: string, pwd: string): Promise<LoginResult> {
  const boot = getLoginBoot();

  try {
    const response = await fetch("/api/method/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Frappe-CSRF-Token": boot.csrfToken,
      },
      credentials: "same-origin",
      body: new URLSearchParams({ usr, pwd }).toString(),
    });

    const data = await response.json();

    if (response.ok && data.message === "Logged In") {
      return { success: true, redirectUrl: boot.redirectUrl };
    }

    if (data.message === "Password Reset") {
      return {
        success: false,
        error: {
          type: "password_reset_required",
          message: "Password reset is required. Use the Forgot password flow below.",
        },
      };
    }

    const serverMessage = typeof data.message === "string" ? data.message : "";
    const error = categorizeError(
      response.status,
      serverMessage || data.exc_type || ""
    );
    return { success: false, error };
  } catch {
    return {
      success: false,
      error: { type: "network", message: "Network connection failed. Retry when the connection is stable." },
    };
  }
}

export async function clinicLogout(): Promise<void> {
  try {
    await fetch("/api/method/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    // Best-effort logout; redirect regardless
  }
}
