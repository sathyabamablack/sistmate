"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

/**
 * The one way in: register number + password, exchanged for an ERP session by
 * the login service. If the student's LMS password differs, the ERP sign-in
 * still succeeds and the dashboard offers "Connect LMS" afterwards, so there is
 * no second password field here.
 */
const noSubscription = () => () => {};
const readExpired = () => new URLSearchParams(window.location.search).get("expired") === "1";

export function LoginForm() {
  const router = useRouter();
  // ?expired=1 is read in the browser, so this page stays static and its form is in the HTML the
  // CDN serves (useSearchParams would leave a blank card until the script loads). The server and
  // the first render assume "not expired"; the browser corrects it right after hydrating.
  const expired = React.useSyncExternalStore(noSubscription, readExpired, () => false);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const message = error ?? (expired && !submitted ? "Your session expired. Sign in again." : null);
  const [loading, setLoading] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; home?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed. Check your details and try again.");
        return;
      }
      // The saved start page; only same-site paths are accepted.
      router.push(data.home?.startsWith("/") && !data.home.startsWith("//") ? data.home : "/");
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form method="post" action="" onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Register number" htmlFor="username">
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          inputMode="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. 42110001"
          required
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </Field>

      {message ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2.5 text-body text-foreground ring-1 ring-danger/30"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          <span>{message}</span>
        </p>
      ) : null}

      <Button type="submit" className="w-full" loading={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
