import Link from "next/link";
import { PageHeader } from "@/components/reachy/stat-card";
import { GenerateReportForm } from "@/components/reachy/generate-report-form";
import { requireSession } from "@/lib/reachy/api-auth";
import { hasRole } from "@/lib/reachy/auth";
import { listReports } from "@/lib/reachy/repositories/report.repository";

const STATUS_STYLES: Record<string, string> = {
  READY: "border-emerald-900 bg-emerald-950 text-emerald-400",
  PENDING: "border-amber-900 bg-amber-950 text-amber-400",
  FAILED: "border-red-900 bg-red-950 text-red-400",
};

export default async function ReportsPage() {
  const session = await requireSession();
  const reports = await listReports();

  return (
    <div>
      <PageHeader title="Reports" description="Weekly and on-demand executive intelligence reports." />
      <div className="space-y-6 px-8 py-6">
        {hasRole(session.user.role, "MANAGER") && <GenerateReportForm />}

        <div className="overflow-hidden rounded-xl border border-neutral-900">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Generated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {reports.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-neutral-500">
                    No reports yet.
                  </td>
                </tr>
              )}
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-900/40">
                  <td className="px-4 py-3">
                    <Link href={`/reachy/reports/${r.id}`} className="font-medium text-neutral-200 hover:text-emerald-400">
                      {r.periodStart.toLocaleDateString()} – {r.periodEnd.toLocaleDateString()}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{r.type === "WEEKLY" ? "Weekly" : "On-demand"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLES[r.status] ?? ""}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{r.createdAt.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
