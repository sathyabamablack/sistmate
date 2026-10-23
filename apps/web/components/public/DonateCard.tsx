"use client";

import * as React from "react";
import QRCode from "qrcode";
import { Check, Copy, Smartphone } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import {
  DEFAULT_AMOUNT,
  MAX_AMOUNT,
  PRESET_AMOUNTS,
  UPI_ID,
  UPI_NAME,
  formatInr,
  parseAmount,
  upiAppLink,
  upiLink,
  validAmount,
  type UpiApp,
} from "@/lib/donate";
import { cn } from "@/lib/utils";

const NOTE = "Support Student Portal";

const APPS: ReadonlyArray<{ app: UpiApp; label: string }> = [
  { app: "gpay", label: "Google Pay" },
  { app: "phonepe", label: "PhonePe" },
  { app: "paytm", label: "Paytm" },
];

const chip =
  "grid h-14 place-items-center rounded-lg border text-subheading font-semibold tabular-nums transition-colors focusable";

const subscribeNever = () => () => {};
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

/** Amount picker plus UPI hand-off. Nothing is stored or sent anywhere; it only builds links. */
export function DonateCard() {
  const [preset, setPreset] = React.useState<number | null>(DEFAULT_AMOUNT);
  const [custom, setCustom] = React.useState("");
  const ios = React.useSyncExternalStore(subscribeNever, isIos, () => false);
  const [copied, setCopied] = React.useState(false);
  // Tagged with the link it encodes, so a stale code is never shown for a new amount.
  const [qr, setQr] = React.useState<{ link: string; src: string } | null>(null);

  const amount = custom !== "" ? parseAmount(custom) : preset;
  const ok = validAmount(amount);
  const req = ok ? { id: UPI_ID, name: UPI_NAME, amount, note: NOTE } : null;
  const generic = req ? upiLink(req) : null;

  React.useEffect(() => {
    if (!generic) return;
    let live = true;
    QRCode.toDataURL(generic, { margin: 1, width: 220, errorCorrectionLevel: "M" })
      .then((src) => live && setQr({ link: generic, src }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [generic]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the id is shown on screen to copy by hand */
    }
  };

  const customInvalid = custom !== "" && !ok;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 sm:p-7">
      <fieldset>
        <legend className="text-small font-medium text-muted-foreground">Choose an amount</legend>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {PRESET_AMOUNTS.map((a) => {
            const selected = custom === "" && preset === a;
            return (
              <button
                key={a}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setPreset(a);
                  setCustom("");
                }}
                className={cn(
                  chip,
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-surface hover:bg-muted",
                )}
              >
                {formatInr(a)}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="donate-custom" className="text-small font-medium text-muted-foreground">
            Or enter your own amount
          </label>
          <div
            className={cn(
              "flex h-14 items-center overflow-hidden rounded-lg border bg-surface",
              customInvalid ? "border-danger" : "border-input",
            )}
          >
            <span aria-hidden className="pl-4 text-subheading font-semibold text-muted-foreground">
              ₹
            </span>
            <input
              id="donate-custom"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Any amount"
              value={custom}
              onChange={(e) => {
                const n = parseAmount(e.target.value);
                setCustom(n === null ? "" : String(n));
              }}
              aria-invalid={customInvalid || undefined}
              aria-describedby="donate-custom-hint"
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-subheading font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground"
            />
          </div>
          <p
            id="donate-custom-hint"
            role={customInvalid ? "alert" : undefined}
            className={cn("text-small", customInvalid ? "text-danger" : "text-muted-foreground")}
          >
            {customInvalid ? `Enter a whole amount from ₹1 to ${formatInr(MAX_AMOUNT)}.` : "Whole rupees, up to " + formatInr(MAX_AMOUNT) + "."}
          </p>
        </div>
      </fieldset>

      <div className="mt-6 border-t border-border pt-6">
        <p className="text-small font-medium text-muted-foreground">You are sending</p>
        <p aria-live="polite" className="mt-1 font-display text-[2.75rem] font-semibold leading-none tabular-nums">
          {ok ? formatInr(amount) : "–"}
        </p>

        <div className="mt-5 grid gap-3">
          {generic ? (
            <a
              href={generic}
              className={buttonClass("primary", "md", "h-12 w-full text-body lg:h-12")}
            >
              <Smartphone className="h-5 w-5" aria-hidden /> Pay {formatInr(amount as number)} with UPI
            </a>
          ) : (
            <span
              aria-disabled="true"
              className={buttonClass("primary", "md", "pointer-events-none h-12 w-full text-body opacity-50 lg:h-12")}
            >
              Enter an amount to pay
            </span>
          )}

          <div className="grid grid-cols-3 gap-3">
            {APPS.map(({ app, label }) =>
              req ? (
                <a
                  key={app}
                  href={upiAppLink(app, req, ios)}
                  className={buttonClass("outline", "md", "px-2")}
                >
                  {label}
                </a>
              ) : (
                <span
                  key={app}
                  aria-disabled="true"
                  className={buttonClass("outline", "md", "pointer-events-none px-2 opacity-50")}
                >
                  {label}
                </span>
              ),
            )}
          </div>
        </div>

        <p className="mt-4 text-small leading-relaxed text-muted-foreground">
          This opens your UPI app with the amount filled in. You confirm and enter your PIN there; the
          portal never sees your payment details.
        </p>
      </div>

      <div className="mt-6 grid gap-5 border-t border-border pt-6 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-small font-medium text-muted-foreground">On a computer, or paying from another phone</p>
          <p className="mt-2 break-all rounded-lg bg-muted px-3 py-2.5 font-mono text-body" data-testid="upi-id">
            {UPI_ID}
          </p>
          <button
            type="button"
            onClick={copyId}
            className={buttonClass("ghost", "md", "-ml-3 mt-1")}
          >
            {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
            {copied ? "Copied" : "Copy UPI ID"}
          </button>
        </div>
        <div className="grid h-[132px] w-[132px] place-items-center justify-self-start rounded-lg border border-border bg-white p-1.5 sm:justify-self-end">
          {qr && qr.link === generic ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr.src} alt={`UPI QR code for ${ok ? formatInr(amount) : "the chosen amount"}`} width={120} height={120} />
          ) : (
            <span className="px-2 text-center text-micro text-muted-foreground">QR appears with an amount</span>
          )}
        </div>
      </div>
    </div>
  );
}
