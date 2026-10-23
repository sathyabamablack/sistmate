import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CalendarOff, CheckCircle2, CircleDashed, Clock, Minus, XCircle } from "lucide-react";
import type { CalendarCell, HourStatus, Tone } from "@/lib/attendance-days";

/**
 * Attendance status is always an icon with its own shape plus words, so it reads
 * without colour. Shared by today's verdicts, the calendar and the hour chips.
 */

export const toneIcon: Record<Tone, { Icon: LucideIcon; className: string }> = {
  success: { Icon: CheckCircle2, className: "text-success" },
  danger: { Icon: XCircle, className: "text-danger" },
  warning: { Icon: AlertTriangle, className: "text-warning" },
  muted: { Icon: Clock, className: "text-muted-foreground" },
};

type DayStatus = CalendarCell["status"];

export const dayStatus: Record<DayStatus, { Icon: LucideIcon | null; className: string; text: string }> = {
  present: { Icon: CheckCircle2, className: "text-success", text: "Present" },
  absent: { Icon: XCircle, className: "text-danger", text: "Absent" },
  holiday: { Icon: CalendarOff, className: "text-muted-foreground", text: "Holiday" },
  pending: { Icon: Clock, className: "text-muted-foreground", text: "Not marked yet" },
  upcoming: { Icon: CircleDashed, className: "text-muted-foreground", text: "Upcoming" },
  none: { Icon: Minus, className: "text-muted-foreground/70", text: "No classes" },
  later: { Icon: null, className: "text-muted-foreground/70", text: "Not yet" },
};

export const hourStatus: Record<HourStatus, { Icon: LucideIcon; className: string; text: string }> = {
  present: { Icon: CheckCircle2, className: "text-success", text: "Present" },
  absent: { Icon: XCircle, className: "text-danger", text: "Absent" },
  "not-given": { Icon: Clock, className: "text-muted-foreground", text: "Not entered yet" },
};
