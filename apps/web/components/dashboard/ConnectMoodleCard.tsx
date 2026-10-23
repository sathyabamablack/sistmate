"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Panel } from "@/components/ui/Panel";

export function ConnectMoodleCard() {
  const router = useRouter();
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/lms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Couldn't connect your LMS.");
        return;
      }
      setPassword("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel className="ring-1 ring-border">
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6 md:gap-y-1"
      >
        <div className="min-w-0 md:flex-1">
          <p className="font-display text-subheading font-semibold text-foreground">Connect LMS</p>
          <p className="text-body text-muted-foreground">
            Adds your courses, assignments and deadlines. Used once, never stored.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            autoComplete="off"
            aria-label="LMS password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="LMS password"
            className="min-w-0 flex-1 md:w-56 md:flex-none"
          />
          <Button type="submit" disabled={loading || !password}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : "Connect"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-small text-danger md:basis-full">
            {error}
          </p>
        ) : null}
      </form>
    </Panel>
  );
}
