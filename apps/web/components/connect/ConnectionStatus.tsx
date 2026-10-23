import { CheckCircle2, Clock, PlugZap } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { getConnectionState } from "@/lib/connect/server";
import { summarizeConnection } from "@/lib/connect/status";
import { getPrefs } from "@/lib/prefs-server";
import { cn } from "@/lib/utils";

const tones = {
  ok: { icon: CheckCircle2, className: "text-success" },
  warn: { icon: Clock, className: "text-warning" },
  bad: { icon: PlugZap, className: "text-danger" },
} as const;

/**
 * "Connected until 9:40 pm" / "Session expired", with a link back to sign-in
 * when it is needed. Server component: it reads the ERP token's expiry from the
 * session cookie and renders only text, so the token never reaches the client.
 * Renders nothing in demo mode or when signed out.
 */
export async function ConnectionStatus({ className }: { className?: string }) {
  const state = await getConnectionState();
  if (!state) return null;

  const prefs = await getPrefs();
  const summary = summarizeConnection(state, new Date(), prefs.timeFormat);
  const { icon: Icon, className: toneClass } = tones[summary.tone];

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <p role="status" className="flex items-center gap-2 text-small font-medium text-foreground">
        <Icon className={cn("h-4 w-4 shrink-0", toneClass)} aria-hidden />
        {summary.label}
      </p>
      {summary.reconnect ? (
        <a href="/login" className={buttonClass("outline", "sm")}>
          Sign in again
        </a>
      ) : null}
    </div>
  );
}
