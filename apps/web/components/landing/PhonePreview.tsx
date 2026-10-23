"use client";

import * as React from "react";
import { BookOpen, CalendarCheck, GraduationCap, House, Pause, Play } from "lucide-react";
import { PHONE_CANVAS, PhoneFrame } from "@/components/guides/PhoneFrame";
import { MockPage, SubjectRows } from "@/components/guides/mock/pages";
import { StatusBar } from "@/components/guides/mock/phone";
import type { View } from "@/lib/guides";
import { cn } from "@/lib/utils";
import "./landing.css";

const SLIDE_MS = 4500;

// ---------------------------------------------------------------------------
// Reduced motion: the OS setting or the portal's own "Reduce motion" switch.
// ---------------------------------------------------------------------------

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCE_QUERY);
  mq.addEventListener("change", onChange);
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    mq.removeEventListener("change", onChange);
    mo.disconnect();
  };
}

const readReducedMotion = () =>
  window.matchMedia(REDUCE_QUERY).matches || document.documentElement.dataset.motion === "reduce";

/** True on the server, so nothing auto-advances before the client knows. */
function useReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribeMotion, readReducedMotion, () => true);
}

// ---------------------------------------------------------------------------
// Screens (phone canvas units: rem inside a 22.5 x 48rem screen)
// ---------------------------------------------------------------------------

const DASHBOARD_VIEW: View = {
  screen: "phone-app",
  url: "",
  page: "portal-dashboard",
  overlay: null,
  flags: [],
  zoom: 1,
  focus: null,
};

type Tab = "Home" | "Attendance" | "Marks" | "Courses";

function TabBar({ on }: { on: Tab }) {
  const tabs = [
    { label: "Home", Icon: House },
    { label: "Attendance", Icon: CalendarCheck },
    { label: "Marks", Icon: GraduationCap },
    { label: "Courses", Icon: BookOpen },
  ] as const;
  return (
    <div className="grid grid-cols-4 border-t border-border bg-surface pb-[0.9rem] pt-[0.5rem] text-[0.65rem] font-medium text-muted-foreground">
      {tabs.map(({ label, Icon }) => (
        <span key={label} className={cn("flex flex-col items-center gap-[0.2rem]", label === on && "text-primary")}>
          <Icon className="h-[1.1rem] w-[1.1rem]" />
          {label}
        </span>
      ))}
    </div>
  );
}

function HourChip({ state }: { state: "P" | "A" | "-" }) {
  return (
    <span
      className={cn(
        "grid h-[1.6rem] w-[1.6rem] place-items-center rounded-[0.45rem] text-[0.7rem] font-semibold",
        state === "P" && "bg-success/12 text-success",
        state === "A" && "bg-danger/10 text-danger",
        state === "-" && "border border-dashed border-border text-muted-foreground",
      )}
    >
      {state}
    </span>
  );
}

function AttendanceScreen() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-hidden px-[1rem] pt-[0.5rem]">
        <p className="font-display text-[1.4rem] font-semibold">Attendance</p>
        <p className="text-[0.78rem] text-muted-foreground">Overall 84%, above the 75% line</p>
        <div className="mt-[0.8rem] rounded-[1rem] bg-surface p-[0.85rem] shadow-rest">
          <p className="text-[0.75rem] font-semibold text-muted-foreground">Today, Monday 12 October</p>
          <div className="mt-[0.5rem] flex items-center justify-between">
            <span className="text-[0.8rem] font-medium">Daily</span>
            <span className="rounded-full bg-success/12 px-[0.5rem] py-[0.1rem] text-[0.7rem] font-semibold text-success">Present</span>
          </div>
          <div className="mt-[0.5rem] flex items-center justify-between">
            <span className="text-[0.8rem] font-medium">Hour-wise</span>
            <span className="flex gap-[0.25rem]">
              <HourChip state="P" />
              <HourChip state="P" />
              <HourChip state="A" />
              <HourChip state="-" />
            </span>
          </div>
        </div>
        <p className="mt-[1rem] font-display text-[1rem] font-semibold">By subject</p>
        <SubjectRows count={4} />
      </div>
      <TabBar on="Attendance" />
    </div>
  );
}

const SEMESTERS = [
  { name: "Semester 4", gpa: "8.61" },
  { name: "Semester 3", gpa: "8.30" },
  { name: "Semester 2", gpa: "8.48" },
  { name: "Semester 1", gpa: "8.29" },
] as const;

const GRADES = [
  { name: "Data Structures", grade: "A++" },
  { name: "Operating Systems", grade: "A+" },
  { name: "Computer Networks", grade: "A+" },
  { name: "Discrete Mathematics", grade: "B++" },
] as const;

function ResultsScreen() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 overflow-hidden px-[1rem] pt-[0.5rem]">
        <p className="font-display text-[1.4rem] font-semibold">Results</p>
        <div className="mt-[0.8rem] rounded-[1rem] bg-accent p-[1rem] text-accent-foreground">
          <p className="text-[0.75rem] font-semibold opacity-80">CGPA after 4 semesters</p>
          <p className="font-display text-[2.6rem] font-semibold leading-none tabular-nums">8.42</p>
          <p className="mt-[0.4rem] text-[0.72rem] opacity-80">Official Sathyabama grade scale</p>
        </div>
        <ul className="mt-[0.8rem] divide-y divide-border">
          {SEMESTERS.map((s) => (
            <li key={s.name} className="flex items-baseline justify-between py-[0.45rem] text-[0.8rem]">
              <span className="font-medium">{s.name}</span>
              <span className="font-display font-semibold tabular-nums">GPA {s.gpa}</span>
            </li>
          ))}
        </ul>
        <p className="mt-[0.8rem] font-display text-[1rem] font-semibold">Semester 4 grades</p>
        <ul className="mt-[0.2rem] divide-y divide-border">
          {GRADES.map((g) => (
            <li key={g.name} className="flex items-center justify-between py-[0.45rem] text-[0.8rem]">
              <span className="truncate font-medium">{g.name}</span>
              <span className="rounded-full bg-muted px-[0.5rem] py-[0.1rem] text-[0.72rem] font-semibold">{g.grade}</span>
            </li>
          ))}
        </ul>
      </div>
      <TabBar on="Marks" />
    </div>
  );
}

const SLIDES = [
  {
    title: "Home",
    body: "Your next class, and how every subject stands against 75%.",
    screen: () => <MockPage page="portal-dashboard" view={DASHBOARD_VIEW} size="phone" />,
  },
  {
    title: "Attendance",
    body: "Today's daily and hour-wise marks, then each subject with the classes you can skip or must attend.",
    screen: () => <AttendanceScreen />,
  },
  {
    title: "Results",
    body: "Grades on Sathyabama's scale, GPA for each semester and your CGPA.",
    screen: () => <ResultsScreen />,
  },
] as const;

/**
 * "See it on your phone": the device mock from the install guides, showing three
 * screens of the portal in turn. Advances only while on screen and motion is
 * allowed; otherwise it is a still picture that the captions switch.
 */
export function PhonePreview({ intro }: { intro?: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = React.useState(0);
  const [visible, setVisible] = React.useState(false);
  const [userPaused, setUserPaused] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const auto = !reduced;
  const running = auto && visible && !userPaused;
  const next = React.useCallback(() => setIndex((i) => (i + 1) % SLIDES.length), []);

  const scale = "[--s:0.62] sm:[--s:0.7] lg:[--s:0.76]";

  return (
    <div
      ref={ref}
      className="grid gap-y-10 [grid-template-areas:'intro'_'phone'_'list'] md:grid-cols-[auto_minmax(0,1fr)] md:grid-rows-[1fr_auto_auto_1fr] md:gap-x-14 md:gap-y-8 md:[grid-template-areas:'phone_.'_'phone_intro'_'phone_list'_'phone_.'] lg:gap-x-24"
    >
      {intro ? <div className="[grid-area:intro]">{intro}</div> : null}
      <div
        aria-hidden
        inert
        className={cn("relative mx-auto select-none [grid-area:phone]", scale)}
        style={{
          width: `calc(${PHONE_CANVAS.width}rem * var(--s))`,
          height: `calc(${PHONE_CANVAS.height}rem * var(--s))`,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: `${PHONE_CANVAS.width}rem`,
            height: `${PHONE_CANVAS.height}rem`,
            transform: "scale(var(--s))",
          }}
        >
          <PhoneFrame os="android">
            <div className="flex h-full flex-col bg-background">
              <StatusBar os="android" tone="clear" />
              <div className="relative min-h-0 flex-1">
                {SLIDES.map((s, i) => (
                  <div
                    key={s.title}
                    className={cn(
                      "absolute inset-0 transition-opacity duration-500 ease-out-quint",
                      i === index ? "opacity-100" : "opacity-0",
                    )}
                  >
                    {s.screen()}
                  </div>
                ))}
              </div>
            </div>
          </PhoneFrame>
        </div>
      </div>

      <div className="min-w-0 [grid-area:list]">
        <ul className="space-y-1">
          {SLIDES.map((s, i) => {
            const active = i === index;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setIndex(i)}
                  className="group relative grid w-full grid-cols-[3px_minmax(0,1fr)] gap-4 rounded-lg py-3 pr-3 text-left focusable"
                >
                  <span className="relative overflow-hidden rounded-full bg-border">
                    {active ? (
                      auto ? (
                        <span
                          key={`${index}`}
                          className="welcome-timer absolute inset-0 rounded-full bg-primary"
                          data-paused={running ? undefined : ""}
                          style={{ "--welcome-slide-ms": `${SLIDE_MS}ms` } as React.CSSProperties}
                          onAnimationEnd={next}
                        />
                      ) : (
                        <span className="absolute inset-0 rounded-full bg-primary" />
                      )
                    ) : null}
                  </span>
                  <span>
                    <span
                      className={cn(
                        "block font-display text-heading font-semibold transition-colors",
                        active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      {s.title}
                    </span>
                    <span className={cn("mt-1 block max-w-md text-body leading-relaxed", active ? "text-foreground" : "text-muted-foreground")}>
                      {s.body}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {auto ? (
          <button
            type="button"
            onClick={() => setUserPaused((p) => !p)}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-small font-medium text-muted-foreground hover:text-foreground focusable lg:min-h-0"
          >
            {userPaused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
            {userPaused ? "Play the preview" : "Pause the preview"}
          </button>
        ) : null}
        <p className="mt-4 text-small text-muted-foreground">Sample data. Yours comes from your own ERP and LMS accounts.</p>
      </div>
    </div>
  );
}
