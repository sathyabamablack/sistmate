import * as React from "react";
import {
  BookOpen,
  CalendarCheck,
  Check,
  CheckCircle2,
  Copy,
  Download,
  GraduationCap,
  House,
  Puzzle,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import type { Flag, PageId, View } from "@/lib/guides";
import { cn } from "@/lib/utils";

export type MockSize = "phone" | "desktop";

export const hasFlag = (view: View, flag: Flag) => view.flags.includes(flag);

/** Attendance bar with the 80% tick, the portal's one signature motif. */
export function Bar({ pct, low }: { pct: number; low?: boolean }) {
  return (
    <div className="relative h-[0.45rem] rounded-full bg-muted">
      <div className={cn("h-full rounded-full", low ? "bg-danger" : "bg-primary")} style={{ width: `${pct}%` }} />
      <span className="absolute -bottom-[0.2rem] -top-[0.2rem] w-[0.15rem] rounded-full bg-foreground" style={{ left: "80%" }} />
    </div>
  );
}

const SUBJECTS = [
  { name: "Data Structures", pct: 92, skip: "Can skip 4" },
  { name: "Operating Systems", pct: 84, skip: "Can skip 2" },
  { name: "Computer Networks", pct: 79, skip: "Can skip 1" },
  { name: "Discrete Mathematics", pct: 71, skip: "Attend 3 more", low: true },
] as const;

function Brand({ small }: { small?: boolean }) {
  return (
    <span className="flex items-center gap-[0.5rem]">
      <Logo className={small ? "h-[1.5rem] w-[1.5rem]" : "h-[1.75rem] w-[1.75rem]"} />
      <span className="font-display text-[0.95rem] font-semibold">Student Portal</span>
    </span>
  );
}

function Pill({ children, tone = "primary", target, className }: { children: React.ReactNode; tone?: "primary" | "outline"; target?: string; className?: string }) {
  return (
    <span
      data-target={target}
      className={cn(
        "inline-flex items-center justify-center gap-[0.4rem] whitespace-nowrap rounded-[0.6rem] px-[0.85rem] py-[0.5rem] text-[0.8rem] font-semibold",
        tone === "primary" ? "bg-primary text-primary-foreground" : "border border-input bg-surface text-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

function SkipCard() {
  return (
    <div className="rounded-[1rem] bg-surface p-[1rem] shadow-rest">
      <p className="text-[0.75rem] font-semibold text-muted-foreground">Data Structures</p>
      <p className="mt-[0.15rem] font-display text-[1.6rem] font-semibold tabular-nums">92%</p>
      <div className="mt-[0.6rem]">
        <Bar pct={92} />
      </div>
      <p className="mt-[0.6rem] text-[0.8rem] font-medium text-success">You can skip 4 more classes</p>
    </div>
  );
}

function PortalWelcome({ size }: { size: MockSize }) {
  if (size === "phone") {
    return (
      <div className="h-full bg-background">
        <div className="bg-accent text-accent-foreground">
          <div className="flex items-center justify-between px-[1rem] py-[0.75rem]">
            <Brand />
            <Pill className="py-[0.4rem]">Sign in</Pill>
          </div>
          <div className="px-[1rem] pb-[1.5rem] pt-[0.75rem]">
            <p className="font-display text-[1.85rem] font-semibold leading-[1.05] tracking-tight">
              Can you skip tomorrow&apos;s class?
            </p>
            <p className="mt-[0.75rem] text-[0.85rem] leading-relaxed text-accent-foreground/80">
              Your ERP already knows. This puts the answer where you will actually look.
            </p>
            <div className="mt-[1rem] flex gap-[0.5rem]">
              <Pill>Sign in</Pill>
              <Pill tone="outline">Get started</Pill>
            </div>
          </div>
        </div>
        <div className="p-[1rem]">
          <SkipCard />
        </div>
      </div>
    );
  }
  return (
    <div className="h-full bg-accent text-accent-foreground">
      <div className="flex items-center justify-between px-[2rem] py-[0.9rem]">
        <Brand />
        <span className="flex gap-[0.5rem]">
          <Pill tone="outline">Get started</Pill>
          <Pill>Sign in</Pill>
        </span>
      </div>
      <div className="grid grid-cols-[1fr_0.9fr] items-center gap-[2.5rem] px-[2rem] pt-[2.5rem]">
        <div>
          <p className="font-display text-[2.6rem] font-semibold leading-[1.04] tracking-tight">
            Can you skip tomorrow&apos;s class?
          </p>
          <p className="mt-[1rem] max-w-[24rem] text-[0.95rem] leading-relaxed text-accent-foreground/80">
            Your ERP already knows. This puts the answer where you will actually look, for every subject.
          </p>
          <div className="mt-[1.4rem] flex gap-[0.6rem]">
            <Pill>Sign in</Pill>
            <Pill tone="outline">Get started</Pill>
          </div>
        </div>
        <div className="text-foreground">
          <SkipCard />
        </div>
      </div>
    </div>
  );
}

function PortalConnect({ view }: { view: View }) {
  const copied = hasFlag(view, "copied");
  return (
    <div className="h-full bg-background px-[1rem] py-[0.9rem]">
      <Brand />
      <p className="mt-[1.4rem] font-display text-[1.45rem] font-semibold leading-tight">Connect from your phone</p>
      <p className="mt-[0.4rem] text-[0.8rem] leading-relaxed text-muted-foreground">
        No extension needed. You sign in on the real ERP as usual, and a bookmark passes your session here.
      </p>
      <div className="mt-[1rem] flex items-center justify-between">
        <span className="text-[0.75rem] font-medium text-muted-foreground">Step 1 of 4</span>
        <span className="flex gap-[0.3rem]">
          <span className="h-[0.45rem] w-[1.4rem] rounded-full bg-primary" />
          <span className="h-[0.45rem] w-[0.45rem] rounded-full bg-border" />
          <span className="h-[0.45rem] w-[0.45rem] rounded-full bg-border" />
          <span className="h-[0.45rem] w-[0.45rem] rounded-full bg-border" />
        </span>
      </div>
      <div className="mt-[0.6rem] rounded-[1rem] bg-surface p-[1rem] shadow-rest">
        <p className="font-display text-[1.05rem] font-semibold">Copy the connect link</p>
        <p className="mt-[0.4rem] text-[0.78rem] leading-relaxed text-muted-foreground">
          A small saved script. It only watches your own ERP sign-in and never sees your password.
        </p>
        <span
          data-target="copy-link"
          className="mt-[0.9rem] flex h-[3.1rem] items-center justify-center gap-[0.5rem] rounded-[0.65rem] bg-primary text-[0.9rem] font-semibold text-primary-foreground"
        >
          {copied ? <Check className="h-[1.1rem] w-[1.1rem]" /> : <Copy className="h-[1.1rem] w-[1.1rem]" />}
          Copy connect link
        </span>
        <p className={cn("mt-[0.5rem] h-[1rem] text-[0.78rem] font-semibold text-success", copied && "guide-fade")}>
          {copied ? "Copied" : ""}
        </p>
      </div>
    </div>
  );
}

function PortalInstall() {
  return (
    <div className="h-full bg-surface-2 px-[2.5rem] py-[1.6rem]">
      <p className="font-display text-[1.6rem] font-semibold">Get started in 3 steps</p>
      <p className="mt-[0.3rem] text-[0.85rem] text-muted-foreground">Pick the device you are holding and follow the numbers.</p>
      <p className="mt-[1.1rem] font-display text-[1.05rem] font-semibold">On your computer</p>
      <ol className="mt-[0.6rem] border-t border-border">
        <li className="flex gap-[0.9rem] border-b border-border py-[0.8rem]">
          <span className="grid h-[2rem] w-[2rem] shrink-0 place-items-center rounded-full bg-success text-success-foreground">
            <Check className="h-[1rem] w-[1rem]" />
          </span>
          <span className="pt-[0.3rem] text-[0.9rem] font-semibold">Install the app</span>
        </li>
        <li className="flex gap-[0.9rem] border-b border-border py-[0.8rem]">
          <span className="grid h-[2rem] w-[2rem] shrink-0 place-items-center rounded-full bg-accent font-display text-[0.9rem] font-semibold text-accent-foreground">2</span>
          <div>
            <p className="pt-[0.3rem] text-[0.9rem] font-semibold">Connect your ERP</p>
            <p className="mt-[0.2rem] text-[0.8rem] text-muted-foreground">A small browser extension. Your password never passes through it.</p>
            <Pill target="download-zip" className="mt-[0.7rem] px-[1rem] py-[0.6rem]">
              <Download className="h-[1rem] w-[1rem]" />
              Download the connector
            </Pill>
          </div>
        </li>
        <li className="flex gap-[0.9rem] py-[0.8rem]">
          <span className="grid h-[2rem] w-[2rem] shrink-0 place-items-center rounded-full bg-accent font-display text-[0.9rem] font-semibold text-accent-foreground">3</span>
          <span className="pt-[0.3rem] text-[0.9rem] font-semibold">Add LMS (optional)</span>
        </li>
      </ol>
    </div>
  );
}

function ConnectedToast() {
  return (
    <div className="guide-rise absolute inset-x-[0.75rem] top-[0.6rem] z-10 flex items-center gap-[0.5rem] rounded-[0.7rem] bg-foreground px-[0.85rem] py-[0.6rem] text-[0.8rem] font-semibold text-background shadow-pop">
      <CheckCircle2 className="h-[1rem] w-[1rem] shrink-0 text-success" />
      Connected. Your data is ready.
    </div>
  );
}

export function SubjectRows({ count = 4 }: { count?: number }) {
  return (
    <ul className="divide-y divide-border">
      {SUBJECTS.slice(0, count).map((s) => (
        <li key={s.name} className="py-[0.6rem]">
          <div className="flex items-baseline justify-between gap-[0.5rem]">
            <span className="truncate text-[0.82rem] font-medium">{s.name}</span>
            <span className={cn("font-display text-[0.9rem] font-semibold tabular-nums", "low" in s && s.low && "text-danger")}>{s.pct}%</span>
          </div>
          <div className="mt-[0.4rem]">
            <Bar pct={s.pct} low={"low" in s && s.low} />
          </div>
          <p className={cn("mt-[0.3rem] text-[0.72rem] font-medium", "low" in s && s.low ? "text-danger" : "text-muted-foreground")}>{s.skip}</p>
        </li>
      ))}
    </ul>
  );
}

function PortalDashboard({ view, size }: { view: View; size: MockSize }) {
  const connected = hasFlag(view, "connected");
  if (size === "phone") {
    return (
      <div className="relative flex h-full flex-col bg-background">
        {connected ? <ConnectedToast /> : null}
        <div className="flex items-center justify-between px-[1rem] py-[0.75rem]">
          <Logo className="h-[1.75rem] w-[1.75rem]" />
          <span className="grid h-[1.9rem] w-[1.9rem] place-items-center rounded-full bg-accent text-[0.7rem] font-semibold text-accent-foreground">AS</span>
        </div>
        <div className="flex-1 px-[1rem]">
          <p className="text-[0.75rem] text-muted-foreground">Monday, 12 October</p>
          <p className="font-display text-[1.4rem] font-semibold">Good morning</p>
          <div className="mt-[0.8rem] rounded-[1rem] bg-accent p-[0.9rem] text-accent-foreground">
            <p className="text-[0.72rem] font-semibold uppercase tracking-wide opacity-80">Next class · 10:00 am</p>
            <p className="mt-[0.2rem] font-display text-[1.05rem] font-semibold">Data Structures</p>
            <p className="text-[0.75rem] opacity-80">Room 402 · in 25 minutes</p>
          </div>
          <p className="mt-[1rem] font-display text-[1rem] font-semibold">Attendance</p>
          <SubjectRows count={3} />
        </div>
        <div className="grid grid-cols-4 border-t border-border bg-surface pb-[0.9rem] pt-[0.5rem] text-[0.65rem] font-medium text-muted-foreground">
          {[
            { label: "Home", Icon: House, on: true },
            { label: "Attendance", Icon: CalendarCheck },
            { label: "Marks", Icon: GraduationCap },
            { label: "Courses", Icon: BookOpen },
          ].map(({ label, Icon, on }) => (
            <span key={label} className={cn("flex flex-col items-center gap-[0.2rem]", on && "text-primary")}>
              <Icon className="h-[1.1rem] w-[1.1rem]" />
              {label}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="relative grid h-full grid-cols-[12rem_1fr] bg-background">
      {connected ? (
        <div className="absolute right-[1.25rem] top-[1rem] z-10 w-[18rem]">
          <div className="relative">
            <ConnectedToast />
          </div>
        </div>
      ) : null}
      <aside className="border-r border-border bg-surface px-[0.8rem] py-[1rem]">
        <Brand small />
        <ul className="mt-[1.2rem] space-y-[0.2rem] text-[0.8rem] font-medium text-muted-foreground">
          {["Home", "Attendance", "Marks", "Results", "Timetable", "Fees", "Courses"].map((n, i) => (
            <li key={n} className={cn("rounded-[0.5rem] px-[0.6rem] py-[0.4rem]", i === 0 && "bg-accent text-accent-foreground")}>
              {n}
            </li>
          ))}
        </ul>
      </aside>
      <div className="px-[1.75rem] py-[1.25rem]">
        <p className="text-[0.8rem] text-muted-foreground">Monday, 12 October</p>
        <p className="font-display text-[1.7rem] font-semibold">Good morning</p>
        <div className="mt-[1rem] grid grid-cols-3 gap-[0.8rem]">
          <div className="rounded-[1rem] bg-accent p-[0.9rem] text-accent-foreground">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide opacity-80">Next class</p>
            <p className="mt-[0.2rem] font-display text-[1rem] font-semibold">Data Structures</p>
            <p className="text-[0.75rem] opacity-80">10:00 am · Room 402</p>
          </div>
          <div className="rounded-[1rem] bg-surface p-[0.9rem] shadow-rest">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">Overall</p>
            <p className="mt-[0.2rem] font-display text-[1.5rem] font-semibold tabular-nums">84%</p>
          </div>
          <div className="rounded-[1rem] bg-surface p-[0.9rem] shadow-rest">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">CGPA</p>
            <p className="mt-[0.2rem] font-display text-[1.5rem] font-semibold tabular-nums">8.42</p>
          </div>
        </div>
        <p className="mt-[1.1rem] font-display text-[1rem] font-semibold">Attendance</p>
        <div className="grid grid-cols-2 gap-x-[1.5rem]">
          <SubjectRows count={2} />
          <ul className="divide-y divide-border">
            {SUBJECTS.slice(2).map((s) => (
              <li key={s.name} className="py-[0.6rem]">
                <div className="flex items-baseline justify-between">
                  <span className="text-[0.82rem] font-medium">{s.name}</span>
                  <span className={cn("font-display text-[0.9rem] font-semibold", "low" in s && s.low && "text-danger")}>{s.pct}%</span>
                </div>
                <div className="mt-[0.4rem]">
                  <Bar pct={s.pct} low={"low" in s && s.low} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** A generic ERP sign-in page (no college branding). */
function ErpLogin({ view, size }: { view: View; size: MockSize }) {
  const filled = hasFlag(view, "filled");
  const captcha = hasFlag(view, "captcha");
  const banner = hasFlag(view, "connect-banner");
  const field = "mt-[0.3rem] flex h-[2.6rem] items-center rounded-[0.5rem] border border-input bg-surface px-[0.7rem] text-[0.85rem]";
  const form = (
    <div className={cn("rounded-[0.9rem] bg-surface p-[1.1rem] shadow-rest", size === "desktop" && "w-[22rem]")}>
      <p className="flex items-center gap-[0.5rem] text-[0.75rem] font-semibold uppercase tracking-wide text-muted-foreground">
        <GraduationCap className="h-[1rem] w-[1rem]" />
        College ERP
      </p>
      <p className="mt-[0.4rem] font-display text-[1.25rem] font-semibold">Student sign-in</p>
      <label className="mt-[0.9rem] block text-[0.75rem] font-medium text-muted-foreground">
        Register number
        <span data-target="erp-user" className={field}>
          {filled ? <span className="guide-typing text-foreground [--guide-type-ms:500ms]">42110123</span> : null}
        </span>
      </label>
      <label className="mt-[0.7rem] block text-[0.75rem] font-medium text-muted-foreground">
        Password
        <span className={field}>
          {filled ? <span className="guide-typing tracking-[0.2em] text-foreground [--guide-type-ms:600ms]">••••••••</span> : null}
        </span>
      </label>
      <span
        data-target="erp-captcha"
        className="mt-[0.9rem] flex h-[3rem] items-center gap-[0.6rem] rounded-[0.4rem] border border-border bg-surface-2 px-[0.7rem] text-[0.82rem]"
      >
        <span
          className={cn(
            "grid h-[1.4rem] w-[1.4rem] place-items-center rounded-[0.3rem] border-2",
            captcha ? "border-success bg-success text-success-foreground" : "border-input bg-surface",
          )}
        >
          {captcha ? <Check className="guide-pop h-[0.9rem] w-[0.9rem]" strokeWidth={3} /> : null}
        </span>
        {captcha ? "Success!" : "Verify you are human"}
        <ShieldCheck className="ml-auto h-[1.1rem] w-[1.1rem] text-muted-foreground" />
      </span>
      <span
        data-target="erp-submit"
        className="mt-[0.9rem] flex h-[2.7rem] items-center justify-center rounded-[0.5rem] bg-[#1f3a8a] text-[0.85rem] font-semibold text-white dark:bg-[#3b5bcc]"
      >
        Sign in
      </span>
    </div>
  );
  return (
    <div className="relative h-full bg-[#eef1f6] dark:bg-[#151a24]">
      <div className="bg-[#1f3a8a] px-[1rem] py-[0.7rem] text-[0.85rem] font-semibold text-white dark:bg-[#24366e]">ERP · Student services</div>
      {banner ? (
        <div className="guide-rise absolute inset-x-[0.6rem] top-[0.4rem] z-10 flex items-center gap-[0.5rem] rounded-[0.6rem] bg-[#13483f] px-[0.8rem] py-[0.55rem] text-[0.8rem] font-semibold text-white shadow-pop">
          <Logo className="h-[1.2rem] w-[1.2rem]" />
          Now sign in as usual
        </div>
      ) : null}
      <div className={cn(size === "phone" ? "p-[0.9rem]" : "grid place-items-center pt-[2rem]")}>{form}</div>
    </div>
  );
}

function Toggle({ on, target }: { on: boolean; target?: string }) {
  return (
    <span
      data-target={target}
      className={cn(
        "relative inline-block h-[1.1rem] w-[2.1rem] rounded-full transition-colors",
        on ? "bg-[#1a73e8]/60" : "bg-muted-foreground/40",
      )}
    >
      <span
        className={cn(
          "absolute top-[-0.15rem] h-[1.4rem] w-[1.4rem] rounded-full shadow transition-[left]",
          on ? "left-[0.9rem] bg-[#1a73e8]" : "left-[-0.1rem] bg-surface",
        )}
      />
    </span>
  );
}

function Extensions({ view }: { view: View }) {
  const dev = hasFlag(view, "dev-mode");
  const loaded = hasFlag(view, "loaded");
  return (
    <div className="h-full bg-background">
      <div className="flex items-center gap-[1rem] border-b border-border bg-surface px-[1.25rem] py-[0.75rem]">
        <span className="flex items-center gap-[0.5rem] text-[1.05rem] font-semibold">
          <Puzzle className="h-[1.2rem] w-[1.2rem]" />
          Extensions
        </span>
        <span className="mx-auto flex h-[2.1rem] w-[22rem] items-center gap-[0.5rem] rounded-full bg-muted px-[0.8rem] text-[0.8rem] text-muted-foreground">
          <Search className="h-[0.9rem] w-[0.9rem]" />
          Search extensions
        </span>
        <span className="flex items-center gap-[0.6rem] rounded-[0.5rem] px-[0.4rem] py-[0.3rem] text-[0.8rem] font-medium">
          Developer mode
          <Toggle on={dev} target="dev-mode" />
        </span>
      </div>
      {dev ? (
        <div className="guide-fade flex gap-[0.6rem] border-b border-border px-[1.25rem] py-[0.6rem]">
          <span data-target="load-unpacked" className="rounded-[0.5rem] border border-input bg-surface px-[0.8rem] py-[0.4rem] text-[0.8rem] font-semibold text-[#1a73e8] dark:text-[#8ab4f8]">
            Load unpacked
          </span>
          <span className="rounded-[0.5rem] border border-input px-[0.8rem] py-[0.4rem] text-[0.8rem] font-medium text-muted-foreground">Pack extension</span>
          <span className="rounded-[0.5rem] border border-input px-[0.8rem] py-[0.4rem] text-[0.8rem] font-medium text-muted-foreground">Update</span>
        </div>
      ) : null}
      <div className="p-[1.25rem]">
        {loaded ? (
          <div className="guide-pop w-[20rem] rounded-[0.8rem] bg-surface p-[1rem] shadow-rest">
            <div className="flex gap-[0.7rem]">
              <Logo className="h-[2.4rem] w-[2.4rem] shrink-0" />
              <div className="min-w-0">
                <p className="text-[0.85rem] font-semibold leading-snug">Unified Student Portal: ERP Connector</p>
                <p className="text-[0.72rem] text-muted-foreground">1.1.0</p>
              </div>
            </div>
            <p className="mt-[0.5rem] text-[0.75rem] leading-snug text-muted-foreground">
              After you sign in to the ERP in your own browser, opens your portal dashboard with that session.
            </p>
            <div className="mt-[0.8rem] flex items-center justify-between text-[0.75rem] font-medium text-[#1a73e8] dark:text-[#8ab4f8]">
              <span className="flex gap-[0.9rem]">
                <span>Details</span>
                <span>Remove</span>
              </span>
              <Toggle on />
            </div>
          </div>
        ) : (
          <p className="text-[0.85rem] text-muted-foreground">{dev ? "Click Load unpacked to add an extension from a folder." : "Your extensions appear here."}</p>
        )}
      </div>
    </div>
  );
}

function NewTab({ size }: { size: MockSize }) {
  const letters = ["Y", "G", "W", "M", "L", "N", "D", "+"];
  return (
    <div className={cn("flex h-full flex-col items-center bg-background", size === "phone" ? "pt-[5rem]" : "pt-[6rem]")}>
      <span className={cn("flex items-center gap-[0.6rem] rounded-full border border-border bg-surface px-[1rem] text-[0.85rem] text-muted-foreground shadow-rest", size === "phone" ? "h-[2.8rem] w-[19rem]" : "h-[2.8rem] w-[30rem]")}>
        <Search className="h-[1rem] w-[1rem]" />
        Search or type web address
      </span>
      <div className={cn("mt-[2rem] grid gap-x-[1.25rem] gap-y-[1rem]", size === "phone" ? "grid-cols-4" : "grid-cols-8")}>
        {letters.map((l, i) => (
          <span key={i} className="grid h-[2.6rem] w-[2.6rem] place-items-center rounded-full bg-muted text-[0.85rem] font-semibold text-muted-foreground">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MockPage({ page, view, size }: { page: PageId; view: View; size: MockSize }) {
  switch (page) {
    case "new-tab":
      return <NewTab size={size} />;
    case "portal-welcome":
      return <PortalWelcome size={size} />;
    case "portal-connect":
      return <PortalConnect view={view} />;
    case "portal-install":
      return <PortalInstall />;
    case "portal-dashboard":
      return <PortalDashboard view={view} size={size} />;
    case "erp-login":
      return <ErpLogin view={view} size={size} />;
    case "extensions":
      return <Extensions view={view} />;
  }
}

/** Page title for the desktop tab strip. */
export function pageTitle(page: PageId): string {
  switch (page) {
    case "new-tab":
      return "New Tab";
    case "erp-login":
      return "ERP · Student sign-in";
    case "extensions":
      return "Extensions";
    default:
      return "Student Portal";
  }
}
