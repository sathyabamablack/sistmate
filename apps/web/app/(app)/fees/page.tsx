import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { requireDashboardData } from "@/lib/data";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { FeeLedger } from "@/components/fees/FeeLedger";
import { summarizeFees } from "@/lib/fee-ledger";

export const metadata: Metadata = { title: "Fees" };
export const dynamic = "force-dynamic";

export default async function FeesPage() {
  const data = await requireDashboardData();
  const fees = data.fees;
  const failed = data.issues.some((i) => i.section === "fees");

  return (
    <div>
      <PageHeader
        title="Fees"
        description={fees.length > 0 ? summarizeFees(fees).phrase : "Fee status by academic year."}
      />

      {fees.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={failed ? "Fees couldn't be loaded" : "No fee records"}
          description={
            failed
              ? "Couldn't load fees. Try again in a minute."
              : "No fee records yet."
          }
        />
      ) : (
        <FeeLedger fees={fees} now={new Date()} />
      )}
    </div>
  );
}
