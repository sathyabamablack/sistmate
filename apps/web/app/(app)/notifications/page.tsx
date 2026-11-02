import type { Metadata } from "next";
import { requireDashboardData } from "@/lib/data";
import { PageHeader } from "@/components/ui/PageHeader";
import { NoticeFeed } from "@/components/notices/NoticeFeed";
import { FormulaNotice } from "@/components/notices/FormulaNotice";
import { BackNotice } from "@/components/notices/BackNotice";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const data = await requireDashboardData();
  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Newest first."
      />
      <BackNotice />
      <FormulaNotice />
      <NoticeFeed
        notifications={data.notifications}
        nowIso={new Date().toISOString()}
        lmsConnected={data.connected.lms}
      />
    </div>
  );
}
