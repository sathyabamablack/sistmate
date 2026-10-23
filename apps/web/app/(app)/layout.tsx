import { AlertTriangle, History, RefreshCw } from "lucide-react";
import type { DashboardData } from "@usp/core";
import { MISSING_STUDENT_ID } from "@usp/erp-adapter";
import { requireDashboardData } from "@/lib/data";
import { erpSubjects, visibleCourses } from "@/lib/course-names";
import { getPrefs } from "@/lib/prefs-server";
import { AppShell } from "@/components/layout/AppShell";
import { ConnectionStatus } from "@/components/connect/ConnectionStatus";
import { portalLinks } from "@/components/layout/external-links";
import { Panel } from "@/components/ui/Panel";
import { buttonClass } from "@/components/ui/Button";

// Loads every ERP + LMS section on a cold cache; portals can be slow.
export const maxDuration = 30;

/** The palette only needs a handful of each; keep the client payload small. */
const PALETTE_COURSE_LIMIT = 12;
const PALETTE_NOTICE_LIMIT = 5;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data: DashboardData = await requireDashboardData();

  const unreadCount = data.notifications.filter((n) => !n.read).length;
  const paletteCourses = visibleCourses(
    data.courses,
    await getPrefs(),
    erpSubjects(data.attendance, data.timetable),
  )
    .slice(0, PALETTE_COURSE_LIMIT)
    .map((c) => ({ id: c.id, name: c.displayName || c.fullName || c.shortName }));
  const paletteNotices = [...data.notifications]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, PALETTE_NOTICE_LIMIT)
    .map((n) => ({ id: n.id, title: n.title, source: n.source }));

  const { erpUrl, lmsUrl } = portalLinks();

  return (
    <AppShell
      erpUrl={erpUrl}
      lmsUrl={lmsUrl}
      studentName={data.profile.name}
      registerNumber={data.profile.registerNumber}
      photoUrl={data.profile.photoUrl}
      unreadCount={unreadCount}
      paletteCourses={paletteCourses}
      paletteNotices={paletteNotices}
      connectionStatus={<ConnectionStatus />}
    >
      {data.issues.length > 0 && <IssuesBanner issues={data.issues} />}
      {children}
    </AppShell>
  );
}

function IssuesBanner({ issues }: { issues: DashboardData["issues"] }) {
  if (issues.some((i) => i.message === MISSING_STUDENT_ID)) {
    return (
      <Panel
        tone="accent"
        role="status"
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
        <div className="flex-1">
          <p className="font-medium">Sign in again to load your data</p>
        </div>
        <a href="/api/auth/expired" className={buttonClass("primary", "sm")}>
          Sign in
        </a>
      </Panel>
    );
  }
  // "Showing data saved at 9:12 pm" means a saved copy is on screen: informative, not a failure.
  const stale = issues.filter((i) => STALE_MESSAGE.test(i.message));
  const failed = issues.filter((i) => !STALE_MESSAGE.test(i.message));
  const staleMessages = [...new Set(stale.map((i) => i.message))];
  const sectionNames = (list: typeof issues) =>
    list.map((i) => i.section.replace(/-/g, " ")).join(", ");

  return (
    <>
      {stale.length > 0 && (
        <Panel tone="accent" role="status" className="mb-6 flex items-start gap-3">
          <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            {staleMessages.map((message) => (
              <p key={message} className="font-medium">
                {message}
              </p>
            ))}
            <p className="text-body text-accent-foreground/80">{sectionNames(stale)}</p>
          </div>
        </Panel>
      )}
      {failed.length > 0 && (
        <Panel tone="warning" role="status" className="mb-6 flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <div>
            <p className="font-medium text-foreground">Couldn&apos;t load {sectionNames(failed)}</p>
            <p className="text-body text-muted-foreground">Try Refresh in a minute.</p>
          </div>
        </Panel>
      )}
    </>
  );
}

const STALE_MESSAGE = /^Showing data saved/i;
