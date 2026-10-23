import type { Metadata } from "next";
import Link from "@/components/ui/IntentLink";
import { computeCgpa } from "@usp/core";
import { requireDashboardData, getGradingSettings } from "@/lib/data";
import { getPrefs } from "@/lib/prefs-server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section, sectionLinkClass } from "@/components/ui/Section";
import { Disclosure } from "@/components/ui/Disclosure";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { AcademicRules } from "@/components/settings/AcademicRules";
import { GradingPresets } from "@/components/settings/GradingPresets";
import { HomeLayoutSettings } from "@/components/settings/HomeLayoutSettings";
import { GuideSettings } from "@/components/settings/GuideSettings";
import { PrefsProvider } from "@/components/settings/PrefsProvider";
import { ResetSettings } from "@/components/settings/ResetSettings";
import { SupportNudge } from "@/components/support/SupportNudge";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [data, settings, prefs] = await Promise.all([
    requireDashboardData(),
    getGradingSettings(),
    getPrefs(),
  ]);

  // getDashboardData already estimated grades for the live ERP; those semesters carry `estimated`.
  const graded = data.results.filter((s) => s.gpa != null && (s.credits ?? 0) > 0);
  const cgpa = graded.length > 0 ? { value: computeCgpa(graded), semesters: graded.length } : null;
  const published = graded.some((s) => !s.estimated);
  const hiddenIds = new Set(prefs.hiddenCourses);
  const hiddenCourseCount = data.courses.filter((c) => hiddenIds.has(c.id)).length;

  return (
    <div>
      <PageHeader title="Settings" />

      <PrefsProvider initial={prefs}>
        <div className="space-y-10">
          {/* The one setting that changes the numbers on every other page comes first. */}
          <Section title="Attendance and grades" id="rules">
            <AcademicRules />
          </Section>

          <Section title="Courses" id="courses">
            <CoursesRow total={data.courses.length} hidden={hiddenCourseCount} />
          </Section>

          <div>
            <Disclosure title="Grade scheme" hint="Grade bands and credits used for your GPA" id="grades">
              <GradingPresets settings={settings} cgpa={cgpa} published={published} />
            </Disclosure>

            <Disclosure title="Appearance" hint="Theme, colour, text size" id="appearance">
              <AppearanceSettings />
            </Disclosure>

            <Disclosure title="Home screen" hint="Start page and dashboard order" id="layout">
              <div className="space-y-8">
                <HomeLayoutSettings />
                <GuideSettings />
              </div>
            </Disclosure>
          </div>

          <Section title="Support" id="support">
            <SupportNudge lead="The portal is free and made by a student. Tips keep it online." action="Support the portal" />
          </Section>

          <ResetSettings />
        </div>
      </PrefsProvider>
    </div>
  );
}

/** Which Moodle courses are listed. The chooser itself lives on the Courses page. */
function CoursesRow({ total, hidden }: { total: number; hidden: number }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <p className="min-w-0 text-body text-muted-foreground">
        {total === 0
          ? "No LMS courses yet."
          : hidden > 0
            ? `${total - hidden} of ${total} shown.`
            : `All ${total} shown.`}
      </p>
      {total > 0 ? (
        <Link href="/courses?choose=1" className={sectionLinkClass}>
          Choose courses
        </Link>
      ) : null}
    </div>
  );
}
