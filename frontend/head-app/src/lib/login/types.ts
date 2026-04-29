export type LoginMode = "login" | "access-denied";

export interface LoginBoot {
  app: "clinic_flow";
  slice: "login";
  route: "/clinic/login";
  siteName: string;
  csrfToken: string;
  redirectUrl: string;
  mode: LoginMode;
  requiredRoles: string[];
  currentUser: string | null;
}

export type LoginErrorType =
  | "invalid_credentials"
  | "account_disabled"
  | "rate_limited"
  | "network"
  | "password_reset_required"
  | "unknown";

export interface LoginError {
  type: LoginErrorType;
  message: string;
}
