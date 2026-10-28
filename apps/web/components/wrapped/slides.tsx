import type { CSSProperties, ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Check, Minus } from "lucide-react";
import { formatPct } from "@/lib/attendance";
import { cn } from "@/lib/utils";
import {
  formatGpa,
  gpaChangeWords,
  listTitles,
  paperMarks,
  papersWord,
  TOP_GRADE_POINTS,
  type Wrapped,
  type WrappedSlideId,
} from "@/lib/wrapped";
import { Ring } from "./Ring";
import styles from "./wrapped.module.css";

/**
 * Colour blocks for the slides, all from the theme tokens so they follow light, dark and the
 * accent presets. `soft` is a quiet chip on the block, `track`/`bar` the progress bar.
 */
export interface SlideTheme {
  frame: string;
  muted: string;
  soft: string;
  track: string;
  bar: string;
  /** Focus ring that shows on this block. */
  focus: string;
}

export const THEMES = {
  pine: {
    frame: "bg-primary text-primary-foreground",
    muted: "text-primary-foreground/85",
    soft: "bg-primary-foreground/15",
    track: "bg-primary-foreground/25",
    bar: "bg-primary-foreground",
    focus: "focus-visible:ring-primary-foreground",
  },
  mint: {
    frame: "bg-accent text-accent-foreground",
    muted: "text-accent-foreground/85",
    soft: "bg-accent-foreground/10",
    track: "bg-accent-foreground/20",
    bar: "bg-accent-foreground",
    focus: "focus-visible:ring-accent-foreground",
  },
  amber: {
    frame: "bg-warning text-warning-foreground",
    muted: "text-warning-foreground/90",
    soft: "bg-warning-foreground/15",
    track: "bg-warning-foreground/25",
    bar: "bg-warning-foreground",
    focus: "focus-visible:ring-warning-foreground",
  },
  ink: {
    frame: "bg-foreground text-background",
    muted: "text-background/80",
    soft: "bg-background/15",
    track: "bg-background/25",
    bar: "bg-background",
    focus: "focus-visible:ring-background",
  },
  green: {
    frame: "bg-success text-success-foreground",
    muted: "text-success-foreground/90",
    soft: "bg-success-foreground/15",
    track: "bg-success-foreground/25",
    bar: "bg-success-foreground",
    focus: "focus-visible:ring-success-foreground",
  },
  paper: {
    frame: "bg-surface text-foreground ring-1 ring-inset ring-border",
    muted: "text-muted-foreground",
    soft: "bg-muted",
    track: "bg-foreground/15",
    bar: "bg-primary",
    focus: "focus-visible:ring-ring",
  },
  /** The closing card: the share image's own palette, the same in light and dark. */
  brand: {
    frame: "bg-[#134841] text-[#f3f6f4]",
    muted: "text-[#f3f6f4]/80",
    soft: "bg-[#f3f6f4]/12",
    track: "bg-[#f3f6f4]/25",
    bar: "bg-[#f3f6f4]",
    focus: "focus-visible:ring-[#f3f6f4]",
  },
} satisfies Record<string, SlideTheme>;

export function slideTheme(id: WrappedSlideId, w: Wrapped): SlideTheme {
  switch (id) {
    case "gpa":
      return THEMES.pine;
    case "cgpa":
      return THEMES.mint;
    case "best":
      return THEMES.amber;
    case "top-grades":
      return THEMES.ink;
    case "arrears":
      return w.arrears.standing === 0 ? THEMES.green : THEMES.paper;
    case "attendance":
      return THEMES.paper;
    case "summary":
      return THEMES.brand;
  }
}

/** Staggered entrance: `i` is the order the element arrives in. */
const at = (i: number) => ({ "--i": i }) as CSSProperties;

/** Big numbers scale with the slide (it is a size container), so they fit a phone and a desktop card. */
const HERO = "font-display font-semibold leading-[0.85] tracking-[-0.045em] tabular-nums";

function Body({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative flex h-full flex-col overflow-hidden px-6 pb-7 pt-12 sm:px-7", className)}>
      {children}
    </div>
  );
}

function Eyebrow({ children, theme }: { children: ReactNode; theme: SlideTheme }) {
  return (
    <p
      className={cn(styles.rise, "text-small font-semibold uppercase tracking-[0.14em]", theme.muted)}
      style={at(0)}
    >
      {children}
    </p>
  );
}

function Title({ children, i = 1 }: { children: ReactNode; i?: number }) {
  return (
    <h2
      className={cn(styles.rise, "mt-2 font-display text-[clamp(1.75rem,9cqw,2.5rem)] font-semibold leading-[1.1] tracking-tight")}
      style={at(i)}
    >
      {children}
    </h2>
  );
}

export function EstimatedPill({ theme, className }: { theme: SlideTheme; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 align-middle font-sans text-micro font-semibold tracking-normal",
        theme.soft,
        className,
      )}
    >
      Estimated
    </span>
  );
}

function ChangeChip({ w, theme }: { w: Wrapped; theme: SlideTheme }) {
  const d = w.gpaDelta;
  const Icon = d == null ? null : Math.abs(d) < 0.005 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <p
      className={cn(
        styles.rise,
        "mt-5 inline-flex w-fit items-center gap-1.5 rounded-full px-3.5 py-2 text-body font-semibold",
        theme.soft,
      )}
      style={at(3)}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {gpaChangeWords(w)}
    </p>
  );
}

function GpaSlide({ w, theme }: SlideProps) {
  return (
    <Body>
      <Eyebrow theme={theme}>Semester {w.semester}</Eyebrow>
      <Title>
        Your GPA {w.estimated ? <EstimatedPill theme={theme} className="ml-1" /> : null}
      </Title>
      <p className={cn(styles.stamp, HERO, "mt-4 text-[min(36cqw,24cqh)]")} style={at(2)}>
        {formatGpa(w.gpa)}
      </p>
      <ChangeChip w={w} theme={theme} />
      <div className="mt-auto flex items-end justify-between gap-4">
        <p className={cn(styles.rise, "max-w-[55%] text-small", theme.muted)} style={at(4)}>
          {w.estimated ? "Worked out from your marks on the official grade scale." : "Out of 10."}
        </p>
        {/* The logo's ring, filled to the GPA out of 10. */}
        <Ring value={(w.gpa ?? 0) / 10} className={cn(styles.stamp, "w-[38%] shrink-0")} trackOpacity={0.2} strokeWidth={22} />
      </div>
    </Body>
  );
}

function Stat({ value, label, theme, i }: { value: string; label: string; theme: SlideTheme; i: number }) {
  return (
    <div className={cn(styles.rise, "min-w-0 rounded-xl px-4 py-3.5", theme.soft)} style={at(i)}>
      <p className="font-display text-[clamp(1.75rem,10cqw,2.5rem)] font-semibold leading-none tabular-nums">{value}</p>
      <p className={cn("mt-1.5 text-small font-medium", theme.muted)}>{label}</p>
    </div>
  );
}

/** Every semester's GPA as a bar, the wrapped one solid. */
function GpaBars({ w, theme }: SlideProps) {
  if (w.history.length < 2) return null;
  return (
    <ol className="my-auto flex h-[min(9rem,20cqh)] items-end gap-2 pt-6" aria-label="GPA by semester">
      {w.history.map((h, i) => {
        const latest = h.semester === w.semester;
        return (
          <li key={h.semester} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span className={cn("text-micro font-semibold tabular-nums", latest ? "" : theme.muted)}>{formatGpa(h.gpa)}</span>
            <span
              className={cn(styles.rise, "w-full rounded-t-md", latest ? theme.bar : theme.track)}
              style={{ ...at(2 + i), height: `${Math.max(8, (h.gpa / 10) * 100)}%` }}
              aria-hidden
            />
            <span className={cn("text-micro font-medium", theme.muted)}>
              <span aria-hidden>S{h.semester}</span>
              <span className="sr-only">Semester {h.semester}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function CgpaSlide({ w, theme }: SlideProps) {
  const sems = w.semesterCount;
  return (
    <Body>
      <Eyebrow theme={theme}>
        After {sems} {sems === 1 ? "semester" : "semesters"}
      </Eyebrow>
      <Title>
        Your CGPA {w.estimated ? <EstimatedPill theme={theme} className="ml-1" /> : null}
      </Title>
      <p className={cn(styles.stamp, HERO, "mt-4 text-[min(32cqw,19cqh)]")} style={at(2)}>
        {formatGpa(w.cgpa)}
      </p>
      <GpaBars w={w} theme={theme} />
      <div className={cn("grid grid-cols-2 gap-3", w.history.length < 2 && "mt-auto")}>
        {w.credits.semester != null ? (
          <Stat value={String(w.credits.semester)} label="credits this semester" theme={theme} i={3} />
        ) : null}
        {w.credits.total != null ? (
          <Stat value={String(w.credits.total)} label="credits so far" theme={theme} i={4} />
        ) : null}
      </div>
    </Body>
  );
}

function BestSlide({ w, theme }: SlideProps) {
  const [first, ...rest] = w.best;
  if (!first) return null;
  const tie = rest.length > 0;
  return (
    <Body>
      <Eyebrow theme={theme}>Semester {w.semester}</Eyebrow>
      <Title>{tie ? "A tie at the top" : "Your best subject"}</Title>
      {first.grade ? (
        <p
          className={cn(
            styles.stamp,
            HERO,
            "mt-5 w-fit rounded-2xl px-4 pb-3 pt-4 text-[min(30cqw,19cqh)] tracking-[-0.03em]",
            theme.soft,
          )}
          style={at(2)}
        >
          {first.grade}
        </p>
      ) : null}
      <div className="mt-auto">
        {tie ? (
          <ul className="space-y-3">
            {w.best.slice(0, 3).map((p, i) => (
              <li key={p.code} className={styles.rise} style={at(3 + i)}>
                <p className="font-display text-[clamp(1.25rem,7cqw,1.75rem)] font-semibold leading-tight">{p.title}</p>
                {paperMarks(p) ? <p className={cn("text-small font-medium", theme.muted)}>{paperMarks(p)}</p> : null}
              </li>
            ))}
            {w.best.length > 3 ? (
              <li className={cn("text-small font-medium", theme.muted)}>and {w.best.length - 3} more</li>
            ) : null}
          </ul>
        ) : (
          <>
            <p
              className={cn(styles.rise, "font-display text-[clamp(1.75rem,10.5cqw,2.75rem)] font-semibold leading-[1.05] tracking-tight")}
              style={at(3)}
            >
              {first.title}
            </p>
            {paperMarks(first) ? (
              <p className={cn(styles.rise, "mt-2 text-subheading font-semibold tabular-nums", theme.muted)} style={at(4)}>
                {paperMarks(first)}
              </p>
            ) : null}
          </>
        )}
        {w.estimated ? (
          <p className={cn(styles.rise, "mt-4 text-small", theme.muted)} style={at(5)}>
            Grade estimated from your marks.
          </p>
        ) : null}
      </div>
    </Body>
  );
}

function TopGradesSlide({ w, theme }: SlideProps) {
  const t = w.topGrades;
  if (!t) return null;
  const graded = w.papers.filter((p) => p.grade != null);
  return (
    <Body>
      <Eyebrow theme={theme}>Semester {w.semester}</Eyebrow>
      <Title>
        {t.count > 0 ? "Top grades" : "Your grades"}{" "}
        {w.estimated ? <EstimatedPill theme={theme} className="ml-1" /> : null}
      </Title>
      {t.count > 0 ? (
        <>
          <p className={cn(styles.stamp, HERO, "mt-4 text-[min(40cqw,26cqh)]")} style={at(2)}>
            {t.count}
            <span className="ml-2 text-[0.3em] font-semibold tracking-tight">of {t.outOf}</span>
          </p>
          <p className={cn(styles.rise, "mt-3 text-body font-medium", theme.muted)} style={at(3)}>
            {listTitles(t.byGrade.map((g) => `${g.count} at ${g.grade}`), 3)}, out of {papersWord(t.outOf)}
          </p>
        </>
      ) : (
        <p className={cn(styles.rise, "mt-3 text-body font-medium", theme.muted)} style={at(2)}>
          Every paper this semester, best first.
        </p>
      )}
      <ul className="mt-auto flex flex-wrap gap-2" aria-label="Grades this semester">
        {graded.map((p, i) => {
          const top = (p.gradePoint ?? 0) >= TOP_GRADE_POINTS;
          return (
            <li
              key={p.code}
              className={cn(
                styles.tile,
                "grid h-14 min-w-14 place-items-center rounded-lg px-2 font-display text-subheading font-semibold",
                top ? "bg-background text-foreground" : "text-background/85 ring-1 ring-inset ring-background/35",
              )}
              style={at(i)}
              title={p.title}
            >
              <span aria-hidden>{p.grade}</span>
              <span className="sr-only">
                {p.title}: {p.grade}
              </span>
            </li>
          );
        })}
      </ul>
    </Body>
  );
}

function ArrearsSlide({ w, theme }: SlideProps) {
  const a = w.arrears;
  const cleared = a.clearedThisSemester.map((c) => c.title);
  if (a.standing == null) return null;
  if (a.standing > 0) {
    return (
      <Body>
        <Eyebrow theme={theme}>Arrears</Eyebrow>
        <p className={cn(styles.stamp, HERO, "mt-4 text-[min(40cqw,26cqh)]")} style={at(1)}>
          {a.standing}
        </p>
        <Title i={2}>{a.standing === 1 ? "paper still to clear" : "papers still to clear"}</Title>
        <div className="mt-auto space-y-2">
          {cleared.length > 0 ? (
            <p className={cn(styles.rise, "text-body font-medium")} style={at(3)}>
              You cleared {listTitles(cleared)} this semester.
            </p>
          ) : null}
          <p className={cn(styles.rise, "text-body", theme.muted)} style={at(4)}>
            Results shows the exam marks each one needs.
          </p>
        </div>
      </Body>
    );
  }
  return (
    <Body>
      <Eyebrow theme={theme}>Arrears</Eyebrow>
      {cleared.length > 0 ? (
        <>
          <p
            className={cn(styles.stamp, "mt-4 font-display text-[min(22cqw,14cqh)] font-semibold leading-[0.95] tracking-[-0.04em]")}
            style={at(1)}
          >
            Cleared.
          </p>
          <Title i={2}>{listTitles(cleared)}, done.</Title>
        </>
      ) : (
        <>
          <p className={cn(styles.stamp, HERO, "mt-4 text-[min(40cqw,26cqh)]")} style={at(1)}>
            0
          </p>
          <Title i={2}>arrears</Title>
        </>
      )}
      <Ring value={1} tick={0} className={cn(styles.stamp, "mt-auto w-[38%] self-end")} trackOpacity={0.2} strokeWidth={22} />
      <p className={cn(styles.rise, "mt-5 flex items-center gap-2 text-body font-medium", theme.muted)} style={at(3)}>
        <Check className="h-5 w-5 shrink-0" aria-hidden />
        {cleared.length > 0
          ? "Nothing left to clear."
          : a.clearedTotal > 0
            ? `Nothing to clear. You cleared ${papersWord(a.clearedTotal)} earlier.`
            : "Every paper passed, first time."}
      </p>
    </Body>
  );
}

function AttendanceSlide({ w, theme }: SlideProps) {
  const a = w.attendance;
  if (!a) return null;
  return (
    <Body>
      <Eyebrow theme={theme}>{a.semester != null ? `Semester ${a.semester} so far` : "This semester so far"}</Eyebrow>
      <Title>Attendance</Title>
      <div className={cn(styles.stamp, "relative mx-auto my-auto grid aspect-square w-[min(78%,42cqh)] place-items-center")} style={at(2)}>
        <Ring value={a.percentage / 100} tick={a.threshold / 100} className="absolute inset-0 h-full w-full text-primary" strokeWidth={18} />
        <p className={cn(HERO, "text-[min(15cqw,9cqh)] tracking-[-0.03em]")}>{formatPct(a.percentage)}</p>
      </div>
      <div className="space-y-1">
        {a.best ? (
          <p className={cn(styles.rise, "text-body font-semibold")} style={at(3)}>
            Best: {a.best.title}, {formatPct(a.best.percentage)}
          </p>
        ) : null}
        <p className={cn(styles.rise, "text-small", theme.muted)} style={at(4)}>
          All {a.subjects} {a.subjects === 1 ? "subject" : "subjects"} together. The tick marks {a.threshold}%.
        </p>
      </div>
    </Body>
  );
}

interface SlideProps {
  w: Wrapped;
  theme: SlideTheme;
}

export const SLIDE_BODIES: Record<Exclude<WrappedSlideId, "summary">, (p: SlideProps) => ReactNode> = {
  gpa: GpaSlide,
  cgpa: CgpaSlide,
  best: BestSlide,
  "top-grades": TopGradesSlide,
  arrears: ArrearsSlide,
  attendance: AttendanceSlide,
};

/** What a screen reader hears when the slide comes up. */
export function slideSpeech(id: WrappedSlideId, w: Wrapped): string {
  const est = w.estimated ? ", estimated" : "";
  switch (id) {
    case "gpa":
      return `Semester ${w.semester} GPA${est}: ${formatGpa(w.gpa)}. ${gpaChangeWords(w)}.`;
    case "cgpa":
      return `CGPA${est}: ${formatGpa(w.cgpa)} after ${w.semesterCount} semesters.${
        w.credits.semester != null ? ` ${w.credits.semester} credits this semester` : ""
      }${w.credits.total != null ? `, ${w.credits.total} so far.` : "."}`;
    case "best": {
      const first = w.best[0];
      if (!first) return "";
      if (w.best.length > 1) return `A tie at the top: ${listTitles(w.best.map((p) => p.title), 3)}${first.grade ? `, ${first.grade}` : ""}.`;
      return `Your best subject: ${first.title}${first.grade ? `, ${first.grade}${est}` : ""}${paperMarks(first) ? `, ${paperMarks(first)}` : ""}.`;
    }
    case "top-grades": {
      const t = w.topGrades;
      if (!t) return "";
      if (t.count === 0) return `Your grades this semester: ${w.papers.map((p) => p.grade).join(", ")}.`;
      return `${t.count} top grades out of ${t.outOf} papers: ${t.byGrade.map((g) => `${g.count} ${g.grade}`).join(", ")}.`;
    }
    case "arrears": {
      const a = w.arrears;
      if (a.standing == null) return "";
      const cleared = a.clearedThisSemester.map((c) => c.title);
      if (a.standing > 0) return `${a.standing} ${a.standing === 1 ? "paper" : "papers"} still to clear.`;
      return cleared.length > 0 ? `Arrears cleared: ${listTitles(cleared)}. Nothing left to clear.` : "No arrears.";
    }
    case "attendance": {
      const a = w.attendance;
      if (!a) return "";
      return `Attendance this semester so far: ${formatPct(a.percentage)}.${a.best ? ` Best: ${a.best.title}, ${formatPct(a.best.percentage)}.` : ""}`;
    }
    case "summary":
      return "Your summary card. Share it as an image, with or without your GPA.";
  }
}
