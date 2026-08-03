import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/reachy/stat-card";
import { requireSession } from "@/lib/reachy/api-auth";
import { getPainPointDetail } from "@/lib/reachy/repositories/pain-point.repository";

interface ScoreBreakdownEntry {
  factor: string;
  score: number;
  weight: number;
  rationale: string;
}

export default async function PainPointDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const painPoint = await getPainPointDetail(id);
  if (!painPoint) notFound();

  const breakdown = (painPoint.scoreBreakdown as unknown as ScoreBreakdownEntry[]) ?? [];

  return (
    <div>
      <PageHeader
        title="Pain Point"
        description={painPoint.category?.name ?? "Uncategorized"}
        actions={
          <Link
            href="/reachy/pain-points"
            className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            Back to Pain Points
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 px-8 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-neutral-900 bg-neutral-900/30 p-5">
            <h2 className="text-base font-medium text-neutral-100">{painPoint.problem}</h2>
            {painPoint.quote && <blockquote className="mt-3 border-l-2 border-neutral-800 pl-3 text-sm italic text-neutral-500">“{painPoint.quote}”</blockquote>}
            {painPoint.possibleSolution && (
              <div className="mt-4">
                <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Possible solution</div>
                <p className="mt-1 text-sm text-neutral-300">{painPoint.possibleSolution}</p>
              </div>
            )}
            <a
              href={painPoint.rawItem.url}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex items-center gap-1 text-xs text-emerald-400 hover:underline"
            >
              View source ({painPoint.rawItem.source.name}) <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="rounded-xl border border-neutral-900">
            <div className="border-b border-neutral-900 px-4 py-3 text-sm font-medium text-neutral-300">
              Why this score: {painPoint.opportunityScore}/100
            </div>
            <ul className="divide-y divide-neutral-900">
              {breakdown.map((entry) => (
                <li key={entry.factor} className="px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize text-neutral-200">{entry.factor.replace(/([A-Z])/g, " $1")}</span>
                    <span className="text-neutral-400">
                      {entry.score}/10 · weight {Math.round(entry.weight * 100)}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{entry.rationale}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-neutral-900 bg-neutral-900/30 p-4 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Seller type</dt>
                <dd className="text-neutral-200">{painPoint.sellerType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Advertising type</dt>
                <dd className="text-neutral-200">{painPoint.advertisingType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Severity</dt>
                <dd className="text-neutral-200">{painPoint.severity}/5</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Frequency</dt>
                <dd className="text-neutral-200">{painPoint.frequency}/5</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Emotion</dt>
                <dd className="text-neutral-200">{painPoint.emotion ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Confidence</dt>
                <dd className="text-neutral-200">{Math.round(painPoint.confidenceScore * 100)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Detected</dt>
                <dd className="text-neutral-200">{painPoint.detectedAt.toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>

          {painPoint.competitorMentions.length > 0 && (
            <div className="rounded-xl border border-neutral-900 bg-neutral-900/30 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Competitors mentioned</div>
              <ul className="mt-2 space-y-1">
                {painPoint.competitorMentions.map((m) => (
                  <li key={m.id}>
                    <Link href={`/reachy/competitors`} className="text-sm text-neutral-300 hover:text-emerald-400">
                      {m.competitor.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
