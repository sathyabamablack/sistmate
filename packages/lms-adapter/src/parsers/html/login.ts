import { LmsParseError } from "../errors";
import { cleanText } from "../shared";
import { absUrl, firstMatch, loadPage } from "./dom";
import { LOGIN } from "./selectors";

export interface LoginForm {
  /** Absolute when `pageUrl` was given, else as written in the HTML. */
  action: string;
  /** Upper-case HTTP method, normally "POST". */
  method: string;
  /** Moodle >= 3.6 CSRF token; must be POSTed back with the credentials. */
  logintoken?: string;
  /**
   * Every named input to POST (hidden fields incl. logintoken/anchor, plus the
   * username/password inputs with EMPTY values). Fill
   * `fields[usernameField]` / `fields[passwordField]` and URL-encode.
   */
  fields: Record<string, string>;
  usernameField: string;
  passwordField: string;
}

/**
 * Parse `login/index.php`. Throws `LmsParseError` when no login form exists
 * (e.g. the site redirected to an external SSO page — handle that separately).
 */
export function parseLoginForm(html: string, pageUrl?: string): LoginForm {
  const $ = loadPage(html);
  const form = firstMatch(LOGIN.form, (s) => $(s))?.first();
  if (!form || form.length === 0) {
    throw new LmsParseError("html.parseLoginForm", "No LMS login form found (selectors: LOGIN.form).");
  }

  const fields: Record<string, string> = {};
  form.find("input[name]").each((_, el) => {
    const input = $(el);
    const name = input.attr("name");
    if (!name) return;
    const type = (input.attr("type") ?? "text").toLowerCase();
    if (type === "submit" || type === "button" || type === "image" || type === "file") return;
    if ((type === "checkbox" || type === "radio") && input.attr("checked") === undefined) return;
    fields[name] = type === "password" ? "" : input.attr("value") ?? "";
  });

  const usernameField =
    firstMatch(LOGIN.usernameInput, (s) => form.find(s))?.first().attr("name") ?? "username";
  const passwordField =
    firstMatch(LOGIN.passwordInput, (s) => form.find(s))?.first().attr("name") ?? "password";
  fields[usernameField] = "";
  fields[passwordField] = "";

  const logintoken = form.find(LOGIN.logintokenInput).first().attr("value") || undefined;
  const rawAction = form.attr("action")?.trim() || pageUrl || "login/index.php";

  return {
    action: absUrl(rawAction, pageUrl) ?? rawAction,
    method: (form.attr("method") ?? "post").toUpperCase(),
    logintoken,
    fields,
    usernameField,
    passwordField,
  };
}

/**
 * Inspect the page returned after POSTing credentials. Returns the error
 * message shown by Moodle (e.g. "Invalid login, please try again"), or null
 * when no login error is present.
 */
export function detectLoginFailure(html: string): string | null {
  const $ = loadPage(html);

  const strong = firstMatch(LOGIN.errorStrong, (s) => $(s));
  if (strong) return cleanText(strong.first().text()) || "Login failed.";

  // Generic alert boxes only count on a page that still shows the login form.
  const hasLoginForm = firstMatch(LOGIN.form, (s) => $(s)) !== null;
  if (!hasLoginForm) return null;
  const weak = firstMatch(LOGIN.errorWeak, (s) => $(s));
  if (weak) return cleanText(weak.first().text()) || "Login failed.";
  return null;
}

/** True when the page shows logged-in chrome (logout link / user menu). */
export function isLoggedInPage(html: string): boolean {
  const $ = loadPage(html);
  return firstMatch(LOGIN.loggedInMarkers, (s) => $(s)) !== null;
}
