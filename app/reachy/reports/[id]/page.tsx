import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/reachy/stat-card";
import { EmailReportForm } from "@/components/reachy/email-report-form";
import { requireSession } from "@/lib/reachy/api-auth";
import { hasRole } from "@/lib/reachy/auth";
import { getReportDetail } from "@/lib/reachy/repositories/report.repository";
import type { ReportSections } from "@/lib/reachy/services/report.service";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-900 bg-neutral-900/30 p-4">
      <h3 className="text-sm font-medium text-neutral-200">{title}</h3>
      <div className="mt-2 text-sm text-neutral-400">{children}</div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-neutral-600">None this period.</p>;
  return (
    <ul className="list-disc space-y-1 pl-4">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const report = await getReportDetail(id);
  if (!report) notFound();

  const sections = report.sections as unknown as ReportSections | null;

  return (
    <div>
      <PageHeader
        title="Weekly Intelligence Report"
        description={`${report.periodStart.toLocaleDateString()} – ${report.periodEnd.toLocaleDateString()}`}
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/reachy/reports"
              className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
            >
              Back
            </Link>
            {sections && (
              <a
                href={`/api/reachy/reports/${report.id}/pdf`}
                className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white"
              >
                <Download className="h-3.5 w-3.5" /> Download PDF
              </a>
            )}
          </div>
        }
      />

      <div className="space-y-6 px-8 py-6">
        {report.status === "FAILED" && (
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-400">
            Report generation failed: {report.error}
          </div>
        )}

        {sections && (
          <>
            {hasRole(session.user.role, "MANAGER") && <EmailReportForm reportId={report.id} />}

            <Section title="Executive Summary">
              <p>{sections.executiveSummary}</p>
            </Section>

            <Section title="Top Pain Points">
              <ol className="list-decimal space-y-1 pl-4">
                {sections.topPainPoints.map((p, i) => (
                  <li key={i}>
                    <span className="text-neutral-300">[{p.opportunityScore}]</span> {p.problem}{" "}
                    <span className="text-neutral-600">({p.category ?? "Uncategorized"})</span>
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="Emerging Trends">
              <BulletList items={sections.emergingTrends} />
            </Section>

            <Section title="Competitor Analysis">
              {sections.competitorAnalysis.length === 0 ? (
                <p className="text-neutral-600">No competitor mentions this period.</p>
              ) : (
                <ul className="space-y-1">
                  {sections.competitorAnalysis.map((c, i) => (
                    <li key={i}>
                      {c.competitorName} — {c.mentionCount} mention{c.mentionCount === 1 ? "" : "s"}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Feature Ideas">
              <BulletList items={sections.featureIdeas} />
            </Section>

            <Section title="Products Worth Building">
              <BulletList items={sections.productsWorthBuilding} />
            </Section>

            <Section title="Revenue Opportunities">
              <BulletList items={sections.revenueOpportunities} />
            </Section>

            <Section title="Recommendations">
              <BulletList items={sections.recommendations} />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
