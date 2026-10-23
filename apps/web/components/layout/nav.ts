import {
  LayoutDashboard,
  CalendarCheck,
  ClipboardList,
  Calculator,
  GraduationCap,
  CalendarDays,
  Wallet,
  Bell,
  BookOpen,
  Settings,
  Heart,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "Academics" | "Campus" | "Learning" | "Account";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  group: NavGroup;
  /** Pinned to the phone tab bar; everything else lives in the More sheet. */
  tab?: boolean;
  /** Left out of the phone "More" list because the sheet shows its own card for it. */
  skipInSheet?: boolean;
  /** Left out of the desktop rail because the top bar already links to it. */
  skipInRail?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    group: "Academics",
    label: "Home",
    icon: LayoutDashboard,
    description: "Today, attendance and notices",
    tab: true,
  },
  {
    href: "/attendance",
    group: "Academics",
    label: "Attendance",
    icon: CalendarCheck,
    description: "Percentage per subject and hours you can skip",
    tab: true,
  },
  {
    href: "/timetable",
    group: "Academics",
    label: "Timetable",
    icon: CalendarDays,
    description: "Today's classes and the week",
    tab: true,
  },
  {
    href: "/marks",
    group: "Academics",
    label: "Marks",
    icon: ClipboardList,
    description: "Internal assessment (CAE) marks",
  },
  {
    href: "/results",
    group: "Academics",
    label: "Results",
    icon: GraduationCap,
    description: "Semester results and grades",
  },
  {
    href: "/calculator",
    group: "Academics",
    label: "CGPA planner",
    icon: Calculator,
    description: "Internal marks, needed external marks and GPA",
  },
  {
    href: "/fees",
    group: "Campus",
    label: "Fees",
    icon: Wallet,
    description: "Payments, dues and totals",
  },
  {
    href: "/notifications",
    group: "Campus",
    label: "Notifications",
    icon: Bell,
    description: "Notices from the ERP and LMS",
    skipInRail: true,
  },
  {
    href: "/courses",
    group: "Learning",
    label: "Courses",
    icon: BookOpen,
    description: "LMS courses and assignments",
    tab: true,
  },
  {
    href: "/settings",
    group: "Account",
    label: "Settings",
    icon: Settings,
    description: "Appearance and grade template",
  },
  {
    href: "/support",
    group: "Account",
    label: "Support",
    icon: Heart,
    description: "Chip in to keep the portal running",
    skipInSheet: true,
  },
];

/** Groups in the order they first appear in NAV_ITEMS, so the two cannot drift apart. */
export const NAV_GROUPS: NavGroup[] = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));

export const TAB_ITEMS = NAV_ITEMS.filter((i) => i.tab);

/** Exact match for the home route, segment-aware prefix match for the rest ("/marks" is not "/marks-old"). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** `data-tour` hook on rail and tab bar links: "/attendance" is "nav-attendance", "/" is "nav-home". */
export function navTourId(href: string): string {
  return `nav-${href === "/" ? "home" : href.slice(1)}`;
}

/** The nav item that owns this pathname (so /courses/12 resolves to Courses), if any. */
export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => isActivePath(pathname, i.href));
}
