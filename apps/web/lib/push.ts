/**
 * Browser side of Web Push alerts. Runs only in the browser (it reads navigator and Notification).
 *
 * Nothing about the person is sent: the browser gives us an anonymous push address (an endpoint
 * and two keys) and the push Worker keeps only that, so an admin can send everyone an alert.
 */

export type PushState =
  /** This browser has no push support at all. */
  | "unsupported"
  /** iPhone/iPad: alerts only work once the app is added to the Home Screen. */
  | "needs-install"
  /** The person (or the browser) blocked notifications for this site. */
  | "denied"
  | "off"
  | "on";

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || (window.matchMedia?.("(display-mode: standalone)").matches ?? false);
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Where things stand on this device right now. */
export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isInstalled() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "off";
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const trim = (url: string) => url.replace(/\/+$/, "");

/** Asks permission, subscribes this browser, and tells the push Worker. Throws a short message on failure. */
export async function enablePush(apiUrl: string): Promise<PushState> {
  if (!supported()) return isIos() && !isInstalled() ? "needs-install" : "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "off";

  const api = trim(apiUrl);
  const reg = await navigator.serviceWorker.ready;
  const keyRes = await fetch(`${api}/key`);
  if (!keyRes.ok) throw new Error("Alerts are not available right now. Try again later.");
  const { key } = (await keyRes.json()) as { key: string };

  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) }));
  const res = await fetch(`${api}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    // Do not keep a subscription the server never heard about.
    await sub.unsubscribe().catch(() => false);
    throw new Error("Could not turn on alerts. Try again later.");
  }
  return "on";
}

/** Unsubscribes this browser and tells the push Worker to forget it. */
export async function disablePush(apiUrl: string): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => false);
    // Best effort: if this fails the server drops the address the next time a send is refused.
    await fetch(`${trim(apiUrl)}/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
  }
  return "off";
}
