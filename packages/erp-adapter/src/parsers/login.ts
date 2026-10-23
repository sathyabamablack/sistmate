import * as cheerio from "cheerio";
import { ParseError } from "./errors";
import { DEFAULT_SELECTORS, type ErpSelectors } from "./selectors";
import { cleanText, resolveUrl } from "./table";

/**
 * What the live adapter needs to replay the login POST:
 *  - `action` / `method` of the form,
 *  - `fields`: EVERY hidden input (ASP.NET __VIEWSTATE, __EVENTVALIDATION,
 *    __VIEWSTATEGENERATOR, CSRF tokens...) - post them back unchanged,
 *  - which inputs take the username / password,
 *  - whether a captcha is present (we can't solve those; the UI must ask the
 *    student, or the feature must be disabled).
 */
export interface LoginForm {
  action: string;
  method: string;
  fields: Record<string, string>;
  usernameField?: string;
  passwordField?: string;
  hasCaptcha: boolean;
  /** name of the captcha text box, if any. */
  captchaField?: string;
  /** src of the captcha image, if any (resolved against baseUrl when given). */
  captchaImageUrl?: string;
  /**
   * The submit button. ASP.NET WebForms only runs the click handler when the
   * button's name=value pair is part of the POST, so include it.
   */
  submit?: { name: string; value: string };
}

export interface LoginParseOptions {
  selectors?: ErpSelectors;
  /** Used to resolve the captcha image URL. The form action is returned raw. */
  baseUrl?: string;
}

const TEXTLIKE = new Set(["", "text", "email", "tel", "number", "search"]);

/** alert('...') / alert("...") in inline scripts; group 2 = the message (escapes kept). */
const ALERT_CALL = /alert\s*\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g;

/** Parse the login page's form. Throws ParseError if there is no form at all. */
export function parseLoginForm(html: string, opts: LoginParseOptions = {}): LoginForm {
  const cfg = (opts.selectors ?? DEFAULT_SELECTORS).login;
  const $ = cheerio.load(html);

  const forms = $(cfg.form);
  if (forms.length === 0) throw new ParseError("login", `no <form> matched "${cfg.form}"`);
  const withPassword = forms.filter((_, f) => $(f).find("input[type='password'], input[type='PASSWORD']").length > 0);
  const form = (withPassword.length > 0 ? withPassword : forms).first();

  const fields: Record<string, string> = {};
  let usernameField: string | undefined;
  let passwordField: string | undefined;
  let captchaField: string | undefined;
  const textCandidates: string[] = [];

  for (const el of form.find("input").toArray()) {
    const input = $(el);
    const name = input.attr("name");
    if (!name) continue;
    const type = (input.attr("type") ?? "").trim().toLowerCase();
    const descriptor = [name, input.attr("id") ?? "", input.attr("placeholder") ?? ""].join(" ");

    if (type === "hidden") {
      fields[name] = input.attr("value") ?? "";
    } else if (type === "password") {
      passwordField ??= name;
    } else if (TEXTLIKE.has(type)) {
      if (cfg.captchaInputPattern.test(descriptor)) {
        captchaField ??= name;
      } else {
        textCandidates.push(name);
        if (usernameField === undefined && cfg.usernamePattern.test(descriptor)) usernameField = name;
      }
    }
  }
  usernameField ??= textCandidates[0];

  // Submit button (input or button with a name).
  let submit: LoginForm["submit"];
  for (const el of form.find("input[type='submit'], button[type='submit'], button:not([type])").toArray()) {
    const b = $(el);
    const name = b.attr("name");
    if (!name) continue;
    submit = { name, value: b.attr("value") ?? cleanText(b.text()) };
    break;
  }

  // Captcha: a captcha text box, a captcha image, or a third-party widget.
  let captchaImageUrl: string | undefined;
  for (const el of $("img").toArray()) {
    const img = $(el);
    const descriptor = [img.attr("src"), img.attr("id"), img.attr("alt"), img.attr("class")].join(" ");
    if (cfg.captchaImagePattern.test(descriptor)) {
      captchaImageUrl = resolveUrl(img.attr("src"), opts.baseUrl) ?? img.attr("src");
      break;
    }
  }
  const hasWidget = $(cfg.captchaWidgetSelector).length > 0;
  const hasCaptcha = captchaField !== undefined || captchaImageUrl !== undefined || hasWidget;

  const result: LoginForm = {
    action: form.attr("action") ?? "",
    method: (form.attr("method") ?? "GET").toUpperCase(),
    fields,
    hasCaptcha,
  };
  if (usernameField !== undefined) result.usernameField = usernameField;
  if (passwordField !== undefined) result.passwordField = passwordField;
  if (captchaField !== undefined) result.captchaField = captchaField;
  if (captchaImageUrl !== undefined) result.captchaImageUrl = captchaImageUrl;
  if (submit !== undefined) result.submit = submit;
  return result;
}

/**
 * After POSTing the login form: did it fail? Returns the portal's error
 * message (e.g. "Invalid Username or Password") or null if no failure text
 * was found. Looks at the configured error elements and at
 * `alert('...')` calls in inline scripts (common on ASP.NET pages).
 *
 * null does NOT prove success - also check you are no longer on the login
 * page (see {@link isLoginPage}).
 */
export function detectLoginFailure(html: string, opts: { selectors?: ErpSelectors } = {}): string | null {
  const cfg = (opts.selectors ?? DEFAULT_SELECTORS).login;
  const $ = cheerio.load(html);

  for (const el of $(cfg.errorSelectors).toArray()) {
    const text = cleanText($(el).text());
    if (text && cfg.failurePattern.test(text)) return text;
  }

  for (const el of $("script").toArray()) {
    const src = $(el).html() ?? "";
    // Skip blocks that only DEFINE functions (client-side validation like
    // `function validate() { alert('Please enter ...') }`) - those alerts
    // never fired. ASP.NET startup scripts are bare `alert('...');` calls.
    if (/function\s+[\w$]+\s*\(/.test(src)) continue;
    for (const m of src.matchAll(ALERT_CALL)) {
      const msg = cleanText((m[2] ?? "").replace(/\\(.)/g, "$1"));
      if (msg && cfg.failurePattern.test(msg)) return msg;
    }
  }
  return null;
}

/** True if the page contains a password box - i.e. we're (back) on a login page / session expired. */
export function isLoginPage(html: string): boolean {
  const $ = cheerio.load(html);
  return $("input").filter((_, el) => ($(el).attr("type") ?? "").toLowerCase() === "password").length > 0;
}
