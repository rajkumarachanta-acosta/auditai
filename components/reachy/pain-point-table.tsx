import Link from "next/link";

export interface PainPointRow {
  id: string;
  problem: string;
  category: { name: string; slug: string } | null;
  subcategory: string | null;
  sellerType: string;
  advertisingType: string;
  severity: number;
  frequency: number;
  opportunityScore: number;
  confidenceScore: number;
  detectedAt: string;
  competitors: string[];
  sourceUrl: string;
  sourceName: string;
}

function scoreColor(score: number) {
  if (score >= 75) return "border-emerald-900 bg-emerald-950 text-emerald-400";
  if (score >= 50) return "border-amber-900 bg-amber-950 text-amber-400";
  return "border-neutral-800 text-neutral-400";
}

export function PainPointTable({ rows }: { rows: PainPointRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-900 px-4 py-16 text-center text-sm text-neutral-500">
        No pain points match these filters yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-900">
      <table className="w-full text-sm">
        <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="px-4 py-3 font-medium">Problem</th>
            <th className="px-4 py-3 font-medium">Category</th>
            <th className="px-4 py-3 font-medium">Seller</th>
            <th className="px-4 py-3 font-medium">Detected</th>
            <th className="px-4 py-3 font-medium text-right">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-900">
          {rows.map((row) => (
            <tr key={row.id} className="align-top hover:bg-neutral-900/40">
              <td className="max-w-lg px-4 py-3">
                <Link href={`/reachy/pain-points/${row.id}`} className="font-medium text-neutral-200 hover:text-emerald-400">
                  {row.problem}
                </Link>
                {row.competitors.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.competitors.map((c) => (
                      <span key={c} className="rounded-full border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-400">
                {row.category?.name ?? "Uncategorized"}
                {row.subcategory && <div className="text-xs text-neutral-600">{row.subcategory}</div>}
              </td>
              <td className="px-4 py-3 text-neutral-400">
                <div>{row.sellerType}</div>
                <div className="text-xs text-neutral-600">{row.advertisingType}</div>
              </td>
              <td className="px-4 py-3 text-neutral-400">{new Date(row.detectedAt).toLocaleDateString()}</td>
              <td className="px-4 py-3 text-right">
                <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${scoreColor(row.opportunityScore)}`}>
                  {row.opportunityScore}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, action, params }: { page: number; pageSize: number; total: number; action: string; params: Record<string, string | undefined> }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  function hrefFor(p: number) {
    const usp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) usp.set(key, value);
    }
    usp.set("page", String(p));
    return `${action}?${usp.toString()}`;
  }

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={hrefFor(page - 1)} className="rounded-md border border-neutral-800 px-2.5 py-1 hover:bg-neutral-900">
            Previous
          </Link>
        )}
        {page < totalPages && (
          <Link href={hrefFor(page + 1)} className="rounded-md border border-neutral-800 px-2.5 py-1 hover:bg-neutral-900">
            Next
          </Link>
        )}
      </div>
    </div>
  );
}
