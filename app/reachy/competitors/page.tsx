import { Globe } from "lucide-react";
import { PageHeader } from "@/components/reachy/stat-card";
import { requireSession } from "@/lib/reachy/api-auth";
import { listCompetitorsWithStats } from "@/lib/reachy/repositories/competitor.repository";

export default async function CompetitorsPage() {
  await requireSession();
  const competitors = await listCompetitorsWithStats();

  return (
    <div>
      <PageHeader
        title="Competitor Watch"
        description="Pacvue, Quartile, Perpetua, Helium 10, Scale Insights, Teikametrics — and anyone else pain points mention."
      />
      <div className="grid grid-cols-1 gap-4 px-8 py-6 sm:grid-cols-2 xl:grid-cols-3">
        {competitors.map((c) => (
          <div key={c.id} className="rounded-xl border border-neutral-900 bg-neutral-900/30 p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium text-neutral-100">{c.name}</h3>
                {c.website && (
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 flex items-center gap-1 text-xs text-neutral-500 hover:text-emerald-400"
                  >
                    <Globe className="h-3 w-3" /> {c.website.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
              <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
                {c._count.mentions} mention{c._count.mentions === 1 ? "" : "s"}
              </span>
            </div>

            <dl className="mt-3 space-y-2 text-xs">
              {c.strengths && (
                <div>
                  <dt className="font-medium text-neutral-400">Strengths</dt>
                  <dd className="text-neutral-500">{c.strengths}</dd>
                </div>
              )}
              {c.weaknesses && (
                <div>
                  <dt className="font-medium text-neutral-400">Weaknesses</dt>
                  <dd className="text-neutral-500">{c.weaknesses}</dd>
                </div>
              )}
              {c.marketGaps && (
                <div>
                  <dt className="font-medium text-neutral-400">Market gaps</dt>
                  <dd className="text-neutral-500">{c.marketGaps}</dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
