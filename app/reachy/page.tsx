import Link from "next/link";
import { AlertTriangle, Sparkles, TrendingUp, Tag, Radar, Newspaper } from "lucide-react";
import { PageHeader, StatCard } from "@/components/reachy/stat-card";
import { getDashboardSnapshot } from "@/lib/reachy/services/dashboard.service";

export default async function ReachyDashboardPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Amazon Seller, Vendor & Advertising ecosystem — market intelligence at a glance"
      />

      <div className="grid grid-cols-1 gap-4 px-8 py-6 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total Pain Points" value={snapshot.totalPainPoints} icon={AlertTriangle} />
        <StatCard label="New This Week" value={snapshot.newThisWeek} icon={Sparkles} />
        <StatCard
          label="Top Opportunity"
          value={snapshot.topOpportunity ? `${snapshot.topOpportunity.opportunityScore}` : "—"}
          hint={snapshot.topOpportunity?.problem}
          icon={TrendingUp}
        />
        <StatCard
          label="Trending Category"
          value={snapshot.trendingCategory?.name ?? "—"}
          hint={snapshot.trendingCategory ? `${snapshot.trendingCategory.count} this week` : "No data yet"}
          icon={Tag}
        />
        <StatCard
          label="Competitor Activity"
          value={snapshot.competitorActivity.length}
          hint={snapshot.competitorActivity.map((c) => c.competitorName).join(", ") || "No mentions tracked yet"}
          icon={Radar}
        />
        <StatCard
          label="Latest Insights"
          value={snapshot.latestInsights.length}
          hint="Most recently detected pain points"
          icon={Newspaper}
        />
      </div>

      <div className="px-8 pb-10">
        <div className="rounded-xl border border-neutral-900">
          <div className="border-b border-neutral-900 px-4 py-3 text-sm font-medium text-neutral-300">
            Latest Insights
          </div>
          {snapshot.latestInsights.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-neutral-500">
              No pain points detected yet. Enable a source under{" "}
              <Link href="/reachy/sources" className="text-emerald-400 hover:underline">
                Sources
              </Link>{" "}
              to start ingestion.
            </div>
          ) : (
            <ul className="divide-y divide-neutral-900">
              {snapshot.latestInsights.map((insight) => (
                <li key={insight.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-neutral-200">{insight.problem}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">{insight.category ?? "Uncategorized"}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
                    {insight.opportunityScore}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
